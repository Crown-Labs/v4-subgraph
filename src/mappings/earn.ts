import { Address, BigInt, ethereum, log } from '@graphprotocol/graph-ts'

import {
  RemoveConfigTokenize as RemoveConfigTokenizeEvent,
  SetConfigTokenize as SetConfigTokenizeEvent,
} from '../types/KittycornBank/KittycornBank'
import { EarnEvent, EarnPosition, EarnVault } from '../types/schema'
import { Tokenize as TokenizeTemplate } from '../types/templates'
import {
  Deposit as DepositEvent,
  Tokenize,
  Transfer as TokenizeTransferEvent,
  Withdraw as WithdrawEvent,
} from '../types/templates/Tokenize/Tokenize'
import { getSubgraphConfig, SubgraphConfig } from '../utils/chains'
import { ONE_BI, ZERO_BI } from '../utils/constants'
import { earnPositionId, isEarnExcludedAddress } from '../utils/earn'
import { eventId } from '../utils/id'
import { fetchTokenDecimals, fetchTokenSymbol } from '../utils/token'

// EarnEventType / EarnValuationSource enum values (AssemblyScript has no string enums)
const DEPOSIT = 'DEPOSIT'
const WITHDRAW = 'WITHDRAW'
const TRANSFER_IN = 'TRANSFER_IN'
const TRANSFER_OUT = 'TRANSFER_OUT'
const VALUATION_EXACT = 'EXACT'
const VALUATION_CALL = 'CALL'
const VALUATION_SNAPSHOT = 'SNAPSHOT'

// Event-order independence: Transfer is the only writer of shares / totalSupply / earnShares, Deposit and Withdraw
// are the only writers of deposited / withdrawn. OZ ERC-4626 emits the mint Transfer before Deposit and the burn
// Transfer before Withdraw, but no handler relies on that.

// ---------------------------------------------------------------------------------------------------------------
// KittycornBank data source
// ---------------------------------------------------------------------------------------------------------------

export function handleSetConfigTokenize(event: SetConfigTokenizeEvent): void {
  handleSetConfigTokenizeHelper(event)
}

export function handleRemoveConfigTokenize(event: RemoveConfigTokenizeEvent): void {
  handleRemoveConfigTokenizeHelper(event)
}

export function handleSetConfigTokenizeHelper(
  event: SetConfigTokenizeEvent,
  subgraphConfig: SubgraphConfig = getSubgraphConfig(),
): void {
  // event params are (tokenize, ibToken, ulToken), unlike setConfigTokenize(tokenize, ulToken, ibToken)
  const vaultAddress = event.params.tokenize
  const ulToken = event.params.ulToken
  let vault = EarnVault.load(vaultAddress.toHexString())

  if (vault === null) {
    vault = new EarnVault(vaultAddress.toHexString())
    vault.bank = event.address

    const contract = Tokenize.bind(vaultAddress)
    const symbolResult = contract.try_symbol()
    vault.symbol = symbolResult.reverted ? 'unknown' : symbolResult.value

    // the Bank enforces decimals(tToken) == decimals(ulToken), so the underlying is a valid fallback
    const decimalsResult = contract.try_decimals()
    let decimals = BigInt.fromI32(18)
    if (!decimalsResult.reverted) {
      decimals = BigInt.fromI32(decimalsResult.value)
    } else {
      const underlyingDecimals = fetchTokenDecimals(
        ulToken,
        subgraphConfig.tokenOverrides,
        subgraphConfig.nativeTokenDetails,
      )
      if (underlyingDecimals !== null) {
        decimals = underlyingDecimals
      }
      log.warning('handleSetConfigTokenize: decimals() reverted for vault {}, using {}', [
        vault.id,
        decimals.toString(),
      ])
    }
    vault.decimals = decimals
    vault.underlyingSymbol = fetchTokenSymbol(ulToken, subgraphConfig.tokenOverrides, subgraphConfig.nativeTokenDetails)
    vault.configuredAtBlock = event.block.number
    vault.configuredAtTimestamp = event.block.timestamp

    vault.totalSupply = ZERO_BI
    vault.earnShares = ZERO_BI
    vault.protocolShares = ZERO_BI
    vault.earnDeposited = ZERO_BI
    vault.earnWithdrawn = ZERO_BI
    vault.protocolDeposited = ZERO_BI
    vault.protocolWithdrawn = ZERO_BI
    vault.earnDepositCount = ZERO_BI
    vault.earnWithdrawCount = ZERO_BI
    vault.protocolDepositCount = ZERO_BI
    vault.protocolWithdrawCount = ZERO_BI
    vault.positionCount = ZERO_BI
    vault.activePositionCount = ZERO_BI
    vault.valuationFallbackCount = ZERO_BI

    // A template cannot be stopped, so a vault that is removed and configured again keeps its first instance.
    TokenizeTemplate.create(vaultAddress)
  } else if (!vault.bank.equals(event.address)) {
    log.warning('handleSetConfigTokenize: vault {} registered by Bank {}, already indexed for Bank {}', [
      vault.id,
      event.address.toHexString(),
      vault.bank.toHexString(),
    ])
  }

  vault.underlying = ulToken
  vault.ibToken = event.params.ibToken
  vault.isActive = true
  vault.save()
}

export function handleRemoveConfigTokenizeHelper(event: RemoveConfigTokenizeEvent): void {
  const vault = EarnVault.load(event.params.tokenize.toHexString())
  if (vault === null) {
    log.warning('handleRemoveConfigTokenize: unknown vault {}', [event.params.tokenize.toHexString()])
    return
  }
  // The Bank only removes a vault with totalSupply == 0. Counters are kept, the template keeps running.
  vault.isActive = false
  vault.save()
}

// ---------------------------------------------------------------------------------------------------------------
// Tokenize template
// ---------------------------------------------------------------------------------------------------------------

export function handleEarnTransfer(event: TokenizeTransferEvent): void {
  handleEarnTransferHelper(event)
}

export function handleEarnDeposit(event: DepositEvent): void {
  handleEarnDepositHelper(event)
}

export function handleEarnWithdraw(event: WithdrawEvent): void {
  handleEarnWithdrawHelper(event)
}

function loadVault(event: ethereum.Event): EarnVault | null {
  const vault = EarnVault.load(event.address.toHexString())
  if (vault === null) {
    log.error('Earn: no EarnVault for template address {} (tx {})', [
      event.address.toHexString(),
      event.transaction.hash.toHexString(),
    ])
  }
  return vault
}

function isExcluded(address: Address, vault: EarnVault, subgraphConfig: SubgraphConfig): boolean {
  return isEarnExcludedAddress(address, Address.fromString(vault.id), Address.fromBytes(vault.bank), subgraphConfig)
}

function oneShare(vault: EarnVault): BigInt {
  return BigInt.fromI32(10).pow(vault.decimals.toI32() as u8)
}

// Refresh totalAssets / sharePrice at most once per block. graph-node answers eth_call with the state at the END
// of the event's block, not at the log position; within one block the share price only moves through Aave accrual
// (same timestamp, so none) or a donation, so the difference is at rounding level.
function snapshotVault(vault: EarnVault, event: ethereum.Event): void {
  const lastSnapshotBlock = vault.lastSnapshotBlock
  if (lastSnapshotBlock !== null && lastSnapshotBlock.equals(event.block.number)) {
    return
  }
  const contract = Tokenize.bind(event.address)
  const totalAssetsResult = contract.try_totalAssets()
  if (!totalAssetsResult.reverted) {
    vault.totalAssets = totalAssetsResult.value
  }
  const sharePriceResult = contract.try_convertToAssets(oneShare(vault))
  if (!sharePriceResult.reverted) {
    vault.sharePrice = sharePriceResult.value
  }
  vault.lastSnapshotBlock = event.block.number
}

function loadOrCreatePosition(vault: EarnVault, user: Address, event: ethereum.Event): EarnPosition {
  const id = earnPositionId(Address.fromString(vault.id), user)
  let position = EarnPosition.load(id)
  if (position === null) {
    position = new EarnPosition(id)
    position.vault = vault.id
    position.user = user
    position.shares = ZERO_BI
    position.deposited = ZERO_BI
    position.withdrawn = ZERO_BI
    position.transferredIn = ZERO_BI
    position.transferredOut = ZERO_BI
    position.depositCount = ZERO_BI
    position.withdrawCount = ZERO_BI
    position.transferInCount = ZERO_BI
    position.transferOutCount = ZERO_BI
    position.firstActivityBlock = event.block.number
    position.firstActivityTimestamp = event.block.timestamp
    vault.positionCount = vault.positionCount.plus(ONE_BI)
  }
  position.lastUpdatedBlock = event.block.number
  position.lastUpdatedTimestamp = event.block.timestamp
  return position
}

// Changes a position's shares and keeps vault.earnShares / activePositionCount in step.
function applyShareDelta(vault: EarnVault, position: EarnPosition, delta: BigInt): void {
  const wasActive = position.shares.gt(ZERO_BI)
  position.shares = position.shares.plus(delta)
  vault.earnShares = vault.earnShares.plus(delta)
  const isActive = position.shares.gt(ZERO_BI)
  if (!wasActive && isActive) {
    vault.activePositionCount = vault.activePositionCount.plus(ONE_BI)
  } else if (wasActive && !isActive) {
    vault.activePositionCount = vault.activePositionCount.minus(ONE_BI)
  }
  if (position.shares.lt(ZERO_BI)) {
    // An excluded holder leaked into the tracked set, or an event before the template start was missed.
    log.error('Earn: EarnPosition {} has negative shares {}', [position.id, position.shares.toString()])
  }
}

function writeEarnEvent(
  id: string,
  type: string,
  event: ethereum.Event,
  vault: EarnVault,
  position: EarnPosition,
  counterparty: Address,
  assets: BigInt,
  shares: BigInt,
  valuationSource: string,
): void {
  const earnEvent = new EarnEvent(id)
  earnEvent.vault = vault.id
  earnEvent.position = position.id
  earnEvent.user = position.user
  earnEvent.type = type
  earnEvent.assets = assets
  earnEvent.shares = shares
  earnEvent.counterparty = counterparty
  earnEvent.sharePrice = vault.sharePrice
  earnEvent.valuationSource = valuationSource
  earnEvent.logIndex = event.logIndex
  earnEvent.blockNumber = event.block.number
  earnEvent.timestamp = event.block.timestamp
  earnEvent.txHash = event.transaction.hash
  earnEvent.save()
}

export function handleEarnTransferHelper(
  event: TokenizeTransferEvent,
  subgraphConfig: SubgraphConfig = getSubgraphConfig(),
): void {
  const vault = loadVault(event)
  if (vault === null) return

  const from = event.params.from
  const to = event.params.to
  const value = event.params.value
  if (value.isZero()) return

  snapshotVault(vault, event)

  const isMint = from.equals(Address.zero())
  const isBurn = to.equals(Address.zero())
  if (isMint) vault.totalSupply = vault.totalSupply.plus(value)
  if (isBurn) vault.totalSupply = vault.totalSupply.minus(value)

  // Self transfer: balanceOf is unchanged, and booking it would inflate both transferredIn and transferredOut.
  if (from.equals(to)) {
    vault.save()
    return
  }

  const fromTracked = !isExcluded(from, vault, subgraphConfig)
  const toTracked = !isExcluded(to, vault, subgraphConfig)
  const isRealTransfer = !isMint && !isBurn

  // Real transfers are valued at the vault share price (convertToAssets), not at a swap execution price: Earned
  // measures vault yield only.
  let assets = ZERO_BI
  let valuationSource = VALUATION_EXACT
  if (isRealTransfer && (fromTracked || toTracked)) {
    const assetsResult = Tokenize.bind(event.address).try_convertToAssets(value)
    if (!assetsResult.reverted) {
      assets = assetsResult.value
      valuationSource = VALUATION_CALL
    } else {
      const sharePrice = vault.sharePrice
      assets = sharePrice !== null ? value.times(sharePrice).div(oneShare(vault)) : value
      valuationSource = VALUATION_SNAPSHOT
      vault.valuationFallbackCount = vault.valuationFallbackCount.plus(ONE_BI)
    }
  }

  const id = eventId(event.transaction.hash, event.logIndex)

  if (fromTracked) {
    const position = loadOrCreatePosition(vault, from, event)
    applyShareDelta(vault, position, value.neg())
    // a burn's assets are booked by the Withdraw handler
    if (isRealTransfer) {
      position.transferredOut = position.transferredOut.plus(assets)
      position.transferOutCount = position.transferOutCount.plus(ONE_BI)
      writeEarnEvent(id + '-out', TRANSFER_OUT, event, vault, position, to, assets, value, valuationSource)
    }
    position.save()
  }

  if (toTracked) {
    const position = loadOrCreatePosition(vault, to, event)
    applyShareDelta(vault, position, value)
    // a mint's assets are booked by the Deposit handler
    if (isRealTransfer) {
      position.transferredIn = position.transferredIn.plus(assets)
      position.transferInCount = position.transferInCount.plus(ONE_BI)
      writeEarnEvent(id + '-in', TRANSFER_IN, event, vault, position, from, assets, value, valuationSource)
    }
    position.save()
  }

  vault.protocolShares = vault.totalSupply.minus(vault.earnShares)
  vault.save()
}

export function handleEarnDepositHelper(
  event: DepositEvent,
  subgraphConfig: SubgraphConfig = getSubgraphConfig(),
): void {
  const vault = loadVault(event)
  if (vault === null) return

  // OZ naming: owner is the receiver of the minted shares, sender paid the assets
  const owner = event.params.owner
  const assets = event.params.assets
  snapshotVault(vault, event)

  if (isExcluded(owner, vault, subgraphConfig)) {
    // LP flow (owner = PoolManager via Kittycorn PositionManager / Router) or Bank margin escrow (owner = Bank)
    vault.protocolDeposited = vault.protocolDeposited.plus(assets)
    vault.protocolDepositCount = vault.protocolDepositCount.plus(ONE_BI)
  } else {
    const position = loadOrCreatePosition(vault, owner, event)
    position.deposited = position.deposited.plus(assets)
    position.depositCount = position.depositCount.plus(ONE_BI)
    if (position.firstDepositBlock === null) {
      position.firstDepositBlock = event.block.number
      position.firstDepositTimestamp = event.block.timestamp
    }
    position.save()
    vault.earnDeposited = vault.earnDeposited.plus(assets)
    vault.earnDepositCount = vault.earnDepositCount.plus(ONE_BI)
    writeEarnEvent(
      eventId(event.transaction.hash, event.logIndex),
      DEPOSIT,
      event,
      vault,
      position,
      event.params.sender,
      assets,
      event.params.shares,
      VALUATION_EXACT,
    )
  }
  vault.save()
}

export function handleEarnWithdrawHelper(
  event: WithdrawEvent,
  subgraphConfig: SubgraphConfig = getSubgraphConfig(),
): void {
  const vault = loadVault(event)
  if (vault === null) return

  // debit the owner whose shares were burned, not the receiver of the underlying
  const owner = event.params.owner
  const assets = event.params.assets
  snapshotVault(vault, event)

  if (isExcluded(owner, vault, subgraphConfig)) {
    vault.protocolWithdrawn = vault.protocolWithdrawn.plus(assets)
    vault.protocolWithdrawCount = vault.protocolWithdrawCount.plus(ONE_BI)
  } else {
    const position = loadOrCreatePosition(vault, owner, event)
    position.withdrawn = position.withdrawn.plus(assets)
    position.withdrawCount = position.withdrawCount.plus(ONE_BI)
    position.save()
    vault.earnWithdrawn = vault.earnWithdrawn.plus(assets)
    vault.earnWithdrawCount = vault.earnWithdrawCount.plus(ONE_BI)
    writeEarnEvent(
      eventId(event.transaction.hash, event.logIndex),
      WITHDRAW,
      event,
      vault,
      position,
      event.params.receiver,
      assets,
      event.params.shares,
      VALUATION_EXACT,
    )
  }
  vault.save()
}
