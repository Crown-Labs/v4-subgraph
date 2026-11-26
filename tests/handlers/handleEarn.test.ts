import { Address, BigInt, Bytes, ethereum } from '@graphprotocol/graph-ts'
import {
  afterEach,
  assert,
  beforeEach,
  clearStore,
  createMockedFunction,
  dataSourceMock,
  describe,
  newMockEvent,
  test,
} from 'matchstick-as'

import {
  handleEarnDepositHelper,
  handleEarnTransferHelper,
  handleEarnWithdrawHelper,
  handleRemoveConfigTokenizeHelper,
  handleSetConfigTokenizeHelper,
} from '../../src/mappings/earn'
import { RemoveConfigTokenize, SetConfigTokenize } from '../../src/types/KittycornBank/KittycornBank'
import { EarnEvent, EarnPosition, EarnVault } from '../../src/types/schema'
import {
  Deposit as DepositEvent,
  Transfer as TokenizeTransferEvent,
  Withdraw as WithdrawEvent,
} from '../../src/types/templates/Tokenize/Tokenize'
import { ADDRESS_ZERO } from '../../src/utils/constants'
import {
  D417_TUSDC_BALANCE_AT_FINAL_BLOCK,
  D417_TUSDC_EVENTS,
  D417_TUSDC_VAULT,
  D417_TUSDT_BALANCE_AT_FINAL_BLOCK,
  D417_TUSDT_EVENTS,
  D417_TUSDT_VAULT,
  D417_USER,
  EarnFixtureEvent,
} from './earnD417Fixture'

// Runs against the real base-sepolia config in src/utils/chains.ts (no injected config).
const BASE_SEPOLIA = 'base-sepolia'
const BANK = '0x421cb4490c79727ec961c8fd214a98474425bdde' // Bank proxy
const POOL_MANAGER = '0x05e73354cfdd6745c338b50bcfdfa3aa6fa03408'
const KITTYCORN_PM = '0xd74e9c7d8299a54173db52e9e5d976050196a625'
const KITTYCORN_ROUTER = '0xed7be201640f0a06defe6f13e6da1905137cc9e1'
const STRATEGY_VAULT = '0x85d7ba35f2c1b7be182294193c65152bd366964f' // kcETHHOLD

const TUSDC = '0x9fffc7710fd0df623a4007904516db6b323710a7'
const TUSDT = '0xaf6adc15309e143de39d3ae8b9ed2f829e9b0bf2'
const AAVE_USDC = '0xba50cd2a20f6da35d788639e581bca8d0b5d4d5f'
const AAVE_USDT = '0x0a215d8ba66387dca84b284d18c3b4ec3de6e54a'
const IB_USDC = '0x10f1a9d11cdf50041f3f8cb7191cbe2f31750acc'
const IB_USDT = '0xce3cab45d7ac4c6a7c4e1e3c5a6ae2ec2c4ac018'

const ALICE = '0xa11ce00000000000000000000000000000000001'
const BOB = '0xb0b0000000000000000000000000000000000002'
const RECEIVER = '0x7ece17e700000000000000000000000000000003'

const TX_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const TX_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const TX_C = '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'

const ONE_USDC_SHARE = BigInt.fromI32(1000000)
const SHARE_PRICE = '1000023' // convertToAssets(1e6) used by the synthetic cases
const TOTAL_ASSETS = '11296613470'

function baseEvent(emitter: string, block: i32, logIndex: i32, txHash: string): ethereum.Event {
  const event = newMockEvent()
  event.address = Address.fromString(emitter)
  event.block.number = BigInt.fromI32(block)
  event.block.timestamp = BigInt.fromI32(1795000000 + block)
  event.transaction.hash = Bytes.fromHexString(txHash) as Bytes
  event.logIndex = BigInt.fromI32(logIndex)
  return event
}

function setConfigTokenizeEvent(vault: string, ibToken: string, ulToken: string, block: i32): SetConfigTokenize {
  const base = baseEvent(BANK, block, 0, TX_A)
  return new SetConfigTokenize(
    base.address,
    base.logIndex,
    base.transactionLogIndex,
    base.logType,
    base.block,
    base.transaction,
    [
      new ethereum.EventParam('tokenize', ethereum.Value.fromAddress(Address.fromString(vault))),
      new ethereum.EventParam('ibToken', ethereum.Value.fromAddress(Address.fromString(ibToken))),
      new ethereum.EventParam('ulToken', ethereum.Value.fromAddress(Address.fromString(ulToken))),
    ],
    base.receipt,
  )
}

function removeConfigTokenizeEvent(vault: string, ibToken: string, ulToken: string, block: i32): RemoveConfigTokenize {
  const base = baseEvent(BANK, block, 0, TX_A)
  return new RemoveConfigTokenize(
    base.address,
    base.logIndex,
    base.transactionLogIndex,
    base.logType,
    base.block,
    base.transaction,
    [
      new ethereum.EventParam('tokenize', ethereum.Value.fromAddress(Address.fromString(vault))),
      new ethereum.EventParam('ibToken', ethereum.Value.fromAddress(Address.fromString(ibToken))),
      new ethereum.EventParam('ulToken', ethereum.Value.fromAddress(Address.fromString(ulToken))),
    ],
    base.receipt,
  )
}

function transferEvent(
  vault: string,
  from: string,
  to: string,
  value: string,
  block: i32,
  logIndex: i32,
  txHash: string,
): TokenizeTransferEvent {
  const base = baseEvent(vault, block, logIndex, txHash)
  return new TokenizeTransferEvent(
    base.address,
    base.logIndex,
    base.transactionLogIndex,
    base.logType,
    base.block,
    base.transaction,
    [
      new ethereum.EventParam('from', ethereum.Value.fromAddress(Address.fromString(from))),
      new ethereum.EventParam('to', ethereum.Value.fromAddress(Address.fromString(to))),
      new ethereum.EventParam('value', ethereum.Value.fromUnsignedBigInt(BigInt.fromString(value))),
    ],
    base.receipt,
  )
}

function depositEvent(
  vault: string,
  sender: string,
  owner: string,
  assets: string,
  shares: string,
  block: i32,
  logIndex: i32,
  txHash: string,
): DepositEvent {
  const base = baseEvent(vault, block, logIndex, txHash)
  return new DepositEvent(
    base.address,
    base.logIndex,
    base.transactionLogIndex,
    base.logType,
    base.block,
    base.transaction,
    [
      new ethereum.EventParam('sender', ethereum.Value.fromAddress(Address.fromString(sender))),
      new ethereum.EventParam('owner', ethereum.Value.fromAddress(Address.fromString(owner))),
      new ethereum.EventParam('assets', ethereum.Value.fromUnsignedBigInt(BigInt.fromString(assets))),
      new ethereum.EventParam('shares', ethereum.Value.fromUnsignedBigInt(BigInt.fromString(shares))),
    ],
    base.receipt,
  )
}

function withdrawEvent(
  vault: string,
  sender: string,
  receiver: string,
  owner: string,
  assets: string,
  shares: string,
  block: i32,
  logIndex: i32,
  txHash: string,
): WithdrawEvent {
  const base = baseEvent(vault, block, logIndex, txHash)
  return new WithdrawEvent(
    base.address,
    base.logIndex,
    base.transactionLogIndex,
    base.logType,
    base.block,
    base.transaction,
    [
      new ethereum.EventParam('sender', ethereum.Value.fromAddress(Address.fromString(sender))),
      new ethereum.EventParam('receiver', ethereum.Value.fromAddress(Address.fromString(receiver))),
      new ethereum.EventParam('owner', ethereum.Value.fromAddress(Address.fromString(owner))),
      new ethereum.EventParam('assets', ethereum.Value.fromUnsignedBigInt(BigInt.fromString(assets))),
      new ethereum.EventParam('shares', ethereum.Value.fromUnsignedBigInt(BigInt.fromString(shares))),
    ],
    base.receipt,
  )
}

function mockVaultMetadata(vault: string, symbol: string, ulToken: string, ulSymbol: string): void {
  const vaultAddress = Address.fromString(vault)
  createMockedFunction(vaultAddress, 'symbol', 'symbol():(string)').returns([ethereum.Value.fromString(symbol)])
  createMockedFunction(vaultAddress, 'decimals', 'decimals():(uint8)').returns([ethereum.Value.fromI32(6)])
  createMockedFunction(Address.fromString(ulToken), 'symbol', 'symbol():(string)').returns([
    ethereum.Value.fromString(ulSymbol),
  ])
}

// per-block snapshot calls: totalAssets() and convertToAssets(10^decimals)
function mockSnapshot(vault: string, sharePrice: string, totalAssets: string): void {
  const vaultAddress = Address.fromString(vault)
  createMockedFunction(vaultAddress, 'totalAssets', 'totalAssets():(uint256)').returns([
    ethereum.Value.fromUnsignedBigInt(BigInt.fromString(totalAssets)),
  ])
  createMockedFunction(vaultAddress, 'convertToAssets', 'convertToAssets(uint256):(uint256)')
    .withArgs([ethereum.Value.fromUnsignedBigInt(ONE_USDC_SHARE)])
    .returns([ethereum.Value.fromUnsignedBigInt(BigInt.fromString(sharePrice))])
}

function mockConvertToAssets(vault: string, shares: string, assets: string): void {
  createMockedFunction(Address.fromString(vault), 'convertToAssets', 'convertToAssets(uint256):(uint256)')
    .withArgs([ethereum.Value.fromUnsignedBigInt(BigInt.fromString(shares))])
    .returns([ethereum.Value.fromUnsignedBigInt(BigInt.fromString(assets))])
}

function configureTUSDC(): void {
  mockVaultMetadata(TUSDC, 'tUSDC', AAVE_USDC, 'USDC')
  handleSetConfigTokenizeHelper(setConfigTokenizeEvent(TUSDC, IB_USDC, AAVE_USDC, 100))
  mockSnapshot(TUSDC, SHARE_PRICE, TOTAL_ASSETS)
}

function positionId(vault: string, user: string): string {
  return vault + '-' + user
}

function earnEventId(txHash: string, logIndex: i32): string {
  return txHash + '-' + logIndex.toString()
}

function replay(vault: string, rows: EarnFixtureEvent[]): void {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    mockSnapshot(vault, row.sharePrice, row.totalAssets)
    if (row.kind == 'deposit') {
      handleEarnDepositHelper(
        depositEvent(vault, row.from, row.to, row.assets, row.value, row.block, row.logIndex, row.txHash),
      )
    } else {
      mockConvertToAssets(vault, row.value, row.assets)
      handleEarnTransferHelper(transferEvent(vault, row.from, row.to, row.value, row.block, row.logIndex, row.txHash))
    }
  }
}

describe('SetConfigTokenize / RemoveConfigTokenize', () => {
  beforeEach(() => {
    dataSourceMock.setNetwork(BASE_SEPOLIA)
  })

  afterEach(() => {
    clearStore()
    dataSourceMock.resetValues()
  })

  test('creates one EarnVault and one Tokenize template, reading params in event order', () => {
    configureTUSDC()

    assert.dataSourceCount('Tokenize', 1)
    assert.dataSourceExists('Tokenize', TUSDC)
    assert.fieldEquals('EarnVault', TUSDC, 'bank', BANK)
    assert.fieldEquals('EarnVault', TUSDC, 'symbol', 'tUSDC')
    assert.fieldEquals('EarnVault', TUSDC, 'decimals', '6')
    // SetConfigTokenize(tokenize, ibToken, ulToken): the 3rd param is the underlying
    assert.fieldEquals('EarnVault', TUSDC, 'underlying', AAVE_USDC)
    assert.fieldEquals('EarnVault', TUSDC, 'ibToken', IB_USDC)
    assert.fieldEquals('EarnVault', TUSDC, 'underlyingSymbol', 'USDC')
    assert.fieldEquals('EarnVault', TUSDC, 'isActive', 'true')
    assert.fieldEquals('EarnVault', TUSDC, 'configuredAtBlock', '100')
    assert.fieldEquals('EarnVault', TUSDC, 'totalSupply', '0')

    // repeated config: no second template
    handleSetConfigTokenizeHelper(setConfigTokenizeEvent(TUSDC, IB_USDC, AAVE_USDC, 101))
    assert.dataSourceCount('Tokenize', 1)
    assert.fieldEquals('EarnVault', TUSDC, 'configuredAtBlock', '100')

    // remove marks the vault inactive and keeps it; configuring it again re-activates without a new template
    handleRemoveConfigTokenizeHelper(removeConfigTokenizeEvent(TUSDC, IB_USDC, AAVE_USDC, 102))
    assert.fieldEquals('EarnVault', TUSDC, 'isActive', 'false')
    handleSetConfigTokenizeHelper(setConfigTokenizeEvent(TUSDC, IB_USDC, AAVE_USDC, 103))
    assert.fieldEquals('EarnVault', TUSDC, 'isActive', 'true')
    assert.dataSourceCount('Tokenize', 1)
  })

  test('remove of an unknown vault is ignored', () => {
    handleRemoveConfigTokenizeHelper(removeConfigTokenizeEvent(TUSDT, IB_USDT, AAVE_USDT, 102))
    assert.notInStore('EarnVault', TUSDT)
  })
})

describe('Earn deposit / withdraw / transfer', () => {
  beforeEach(() => {
    dataSourceMock.setNetwork(BASE_SEPOLIA)
    configureTUSDC()
  })

  afterEach(() => {
    clearStore()
    dataSourceMock.resetValues()
  })

  test('direct deposit: mint Transfer + Deposit book shares, deposited and one DEPOSIT EarnEvent', () => {
    handleEarnTransferHelper(transferEvent(TUSDC, ADDRESS_ZERO, ALICE, '1999952', 200, 18, TX_A))
    handleEarnDepositHelper(depositEvent(TUSDC, ALICE, ALICE, '2000000', '1999952', 200, 19, TX_A))

    const id = positionId(TUSDC, ALICE)
    assert.fieldEquals('EarnPosition', id, 'shares', '1999952')
    assert.fieldEquals('EarnPosition', id, 'deposited', '2000000')
    assert.fieldEquals('EarnPosition', id, 'depositCount', '1')
    assert.fieldEquals('EarnPosition', id, 'transferredIn', '0')
    assert.fieldEquals('EarnPosition', id, 'firstDepositBlock', '200')
    assert.fieldEquals('EarnVault', TUSDC, 'totalSupply', '1999952')
    assert.fieldEquals('EarnVault', TUSDC, 'earnShares', '1999952')
    assert.fieldEquals('EarnVault', TUSDC, 'protocolShares', '0')
    assert.fieldEquals('EarnVault', TUSDC, 'earnDeposited', '2000000')
    assert.fieldEquals('EarnVault', TUSDC, 'earnDepositCount', '1')
    assert.fieldEquals('EarnVault', TUSDC, 'activePositionCount', '1')
    assert.fieldEquals('EarnVault', TUSDC, 'sharePrice', SHARE_PRICE)
    assert.fieldEquals('EarnVault', TUSDC, 'totalAssets', TOTAL_ASSETS)

    // the mint Transfer writes no row, the Deposit writes one
    assert.entityCount('EarnEvent', 1)
    const eventKey = earnEventId(TX_A, 19)
    assert.fieldEquals('EarnEvent', eventKey, 'type', 'DEPOSIT')
    assert.fieldEquals('EarnEvent', eventKey, 'vault', TUSDC)
    assert.fieldEquals('EarnEvent', eventKey, 'position', id)
    assert.fieldEquals('EarnEvent', eventKey, 'user', ALICE)
    assert.fieldEquals('EarnEvent', eventKey, 'counterparty', ALICE)
    assert.fieldEquals('EarnEvent', eventKey, 'assets', '2000000')
    assert.fieldEquals('EarnEvent', eventKey, 'shares', '1999952')
    assert.fieldEquals('EarnEvent', eventKey, 'sharePrice', SHARE_PRICE)
    assert.fieldEquals('EarnEvent', eventKey, 'valuationSource', 'EXACT')
    assert.fieldEquals('EarnEvent', eventKey, 'logIndex', '19')
    assert.fieldEquals('EarnEvent', eventKey, 'blockNumber', '200')
    assert.fieldEquals('EarnEvent', eventKey, 'timestamp', '1795000200')
    assert.fieldEquals('EarnEvent', eventKey, 'txHash', TX_A)

    // @derivedFrom links
    const position = EarnPosition.load(id)!
    assert.i32Equals(position.events.load().length, 1)
    const vault = EarnVault.load(TUSDC)!
    assert.i32Equals(vault.events.load().length, 1)
    assert.i32Equals(vault.positions.load().length, 1)
  })

  test('deposit for another owner credits the owner and records the sender as counterparty', () => {
    handleEarnTransferHelper(transferEvent(TUSDC, ADDRESS_ZERO, BOB, '1000', 200, 1, TX_A))
    handleEarnDepositHelper(depositEvent(TUSDC, ALICE, BOB, '1001', '1000', 200, 2, TX_A))

    assert.notInStore('EarnPosition', positionId(TUSDC, ALICE))
    assert.fieldEquals('EarnPosition', positionId(TUSDC, BOB), 'deposited', '1001')
    assert.fieldEquals('EarnEvent', earnEventId(TX_A, 2), 'user', BOB)
    assert.fieldEquals('EarnEvent', earnEventId(TX_A, 2), 'counterparty', ALICE)
  })

  test('Deposit before its mint Transfer ends in the same state (order independence)', () => {
    handleEarnDepositHelper(depositEvent(TUSDC, ALICE, ALICE, '2000000', '1999952', 200, 19, TX_A))
    handleEarnTransferHelper(transferEvent(TUSDC, ADDRESS_ZERO, ALICE, '1999952', 200, 18, TX_A))

    const id = positionId(TUSDC, ALICE)
    assert.fieldEquals('EarnPosition', id, 'shares', '1999952')
    assert.fieldEquals('EarnPosition', id, 'deposited', '2000000')
    assert.fieldEquals('EarnVault', TUSDC, 'earnShares', '1999952')
    assert.fieldEquals('EarnVault', TUSDC, 'activePositionCount', '1')
    assert.fieldEquals('EarnVault', TUSDC, 'positionCount', '1')
    assert.entityCount('EarnEvent', 1)
  })

  test('LP mint to the PoolManager goes to the protocol bucket, no position or EarnEvent', () => {
    handleEarnTransferHelper(transferEvent(TUSDC, ADDRESS_ZERO, POOL_MANAGER, '5000000', 200, 1, TX_A))
    handleEarnDepositHelper(depositEvent(TUSDC, KITTYCORN_PM, POOL_MANAGER, '5000100', '5000000', 200, 2, TX_A))

    assert.entityCount('EarnPosition', 0)
    assert.entityCount('EarnEvent', 0)
    assert.fieldEquals('EarnVault', TUSDC, 'totalSupply', '5000000')
    assert.fieldEquals('EarnVault', TUSDC, 'earnShares', '0')
    assert.fieldEquals('EarnVault', TUSDC, 'protocolShares', '5000000')
    assert.fieldEquals('EarnVault', TUSDC, 'protocolDeposited', '5000100')
    assert.fieldEquals('EarnVault', TUSDC, 'protocolDepositCount', '1')
    assert.fieldEquals('EarnVault', TUSDC, 'earnDepositCount', '0')
  })

  test('Bank margin deposit (owner = Bank) and router flows are excluded', () => {
    handleEarnTransferHelper(transferEvent(TUSDC, ADDRESS_ZERO, BANK, '700', 200, 1, TX_A))
    handleEarnDepositHelper(depositEvent(TUSDC, BANK, BANK, '701', '700', 200, 2, TX_A))
    // Kittycorn router: mint to self, then redeem as self
    handleEarnTransferHelper(transferEvent(TUSDC, ADDRESS_ZERO, KITTYCORN_ROUTER, '300', 201, 1, TX_B))
    handleEarnTransferHelper(transferEvent(TUSDC, KITTYCORN_ROUTER, ADDRESS_ZERO, '300', 201, 2, TX_B))
    handleEarnWithdrawHelper(
      withdrawEvent(TUSDC, KITTYCORN_ROUTER, KITTYCORN_ROUTER, KITTYCORN_ROUTER, '301', '300', 201, 3, TX_B),
    )

    assert.entityCount('EarnPosition', 0)
    assert.entityCount('EarnEvent', 0)
    assert.fieldEquals('EarnVault', TUSDC, 'totalSupply', '700')
    assert.fieldEquals('EarnVault', TUSDC, 'protocolShares', '700')
    assert.fieldEquals('EarnVault', TUSDC, 'protocolDeposited', '701')
    assert.fieldEquals('EarnVault', TUSDC, 'protocolWithdrawn', '301')
    assert.fieldEquals('EarnVault', TUSDC, 'protocolWithdrawCount', '1')
  })

  test('withdraw with receiver != owner debits the owner and records the receiver as counterparty', () => {
    handleEarnTransferHelper(transferEvent(TUSDC, ADDRESS_ZERO, ALICE, '1000000', 200, 1, TX_A))
    handleEarnDepositHelper(depositEvent(TUSDC, ALICE, ALICE, '1000023', '1000000', 200, 2, TX_A))

    // burn Transfer(owner -> 0) then Withdraw(sender, receiver, owner, ...)
    handleEarnTransferHelper(transferEvent(TUSDC, ALICE, ADDRESS_ZERO, '400000', 300, 1, TX_B))
    handleEarnWithdrawHelper(withdrawEvent(TUSDC, ALICE, RECEIVER, ALICE, '400010', '400000', 300, 2, TX_B))

    const id = positionId(TUSDC, ALICE)
    assert.fieldEquals('EarnPosition', id, 'shares', '600000')
    assert.fieldEquals('EarnPosition', id, 'withdrawn', '400010')
    assert.fieldEquals('EarnPosition', id, 'withdrawCount', '1')
    assert.fieldEquals('EarnPosition', id, 'transferredOut', '0')
    assert.notInStore('EarnPosition', positionId(TUSDC, RECEIVER))
    assert.fieldEquals('EarnVault', TUSDC, 'totalSupply', '600000')
    assert.fieldEquals('EarnVault', TUSDC, 'earnWithdrawn', '400010')

    // DEPOSIT + WITHDRAW, the burn Transfer writes no row
    assert.entityCount('EarnEvent', 2)
    const eventKey = earnEventId(TX_B, 2)
    assert.fieldEquals('EarnEvent', eventKey, 'type', 'WITHDRAW')
    assert.fieldEquals('EarnEvent', eventKey, 'user', ALICE)
    assert.fieldEquals('EarnEvent', eventKey, 'counterparty', RECEIVER)
    assert.fieldEquals('EarnEvent', eventKey, 'assets', '400010')
    assert.fieldEquals('EarnEvent', eventKey, 'shares', '400000')
    assert.fieldEquals('EarnEvent', eventKey, 'valuationSource', 'EXACT')
  })

  test('full exit sets shares to 0 and drops the active position count, lifetime counters stay', () => {
    handleEarnTransferHelper(transferEvent(TUSDC, ADDRESS_ZERO, ALICE, '1000', 200, 1, TX_A))
    handleEarnDepositHelper(depositEvent(TUSDC, ALICE, ALICE, '1000', '1000', 200, 2, TX_A))
    handleEarnTransferHelper(transferEvent(TUSDC, ALICE, ADDRESS_ZERO, '1000', 300, 1, TX_B))
    handleEarnWithdrawHelper(withdrawEvent(TUSDC, ALICE, ALICE, ALICE, '1001', '1000', 300, 2, TX_B))

    const id = positionId(TUSDC, ALICE)
    assert.fieldEquals('EarnPosition', id, 'shares', '0')
    assert.fieldEquals('EarnPosition', id, 'deposited', '1000')
    assert.fieldEquals('EarnPosition', id, 'withdrawn', '1001')
    assert.fieldEquals('EarnVault', TUSDC, 'activePositionCount', '0')
    assert.fieldEquals('EarnVault', TUSDC, 'positionCount', '1')
    assert.fieldEquals('EarnVault', TUSDC, 'totalSupply', '0')
  })

  test('wallet-to-wallet transfer books both sides and writes -out / -in rows', () => {
    handleEarnTransferHelper(transferEvent(TUSDC, ADDRESS_ZERO, ALICE, '1000000', 200, 1, TX_A))
    mockConvertToAssets(TUSDC, '250000', '250005')
    handleEarnTransferHelper(transferEvent(TUSDC, ALICE, BOB, '250000', 300, 7, TX_B))

    assert.fieldEquals('EarnPosition', positionId(TUSDC, ALICE), 'shares', '750000')
    assert.fieldEquals('EarnPosition', positionId(TUSDC, ALICE), 'transferredOut', '250005')
    assert.fieldEquals('EarnPosition', positionId(TUSDC, ALICE), 'transferOutCount', '1')
    assert.fieldEquals('EarnPosition', positionId(TUSDC, BOB), 'shares', '250000')
    assert.fieldEquals('EarnPosition', positionId(TUSDC, BOB), 'transferredIn', '250005')
    assert.fieldEquals('EarnPosition', positionId(TUSDC, BOB), 'transferInCount', '1')
    assert.fieldEquals('EarnVault', TUSDC, 'earnShares', '1000000')
    assert.fieldEquals('EarnVault', TUSDC, 'activePositionCount', '2')

    assert.entityCount('EarnEvent', 2)
    const out = earnEventId(TX_B, 7) + '-out'
    const inn = earnEventId(TX_B, 7) + '-in'
    assert.fieldEquals('EarnEvent', out, 'type', 'TRANSFER_OUT')
    assert.fieldEquals('EarnEvent', out, 'user', ALICE)
    assert.fieldEquals('EarnEvent', out, 'counterparty', BOB)
    assert.fieldEquals('EarnEvent', out, 'assets', '250005')
    assert.fieldEquals('EarnEvent', out, 'shares', '250000')
    assert.fieldEquals('EarnEvent', out, 'valuationSource', 'CALL')
    assert.fieldEquals('EarnEvent', inn, 'type', 'TRANSFER_IN')
    assert.fieldEquals('EarnEvent', inn, 'user', BOB)
    assert.fieldEquals('EarnEvent', inn, 'counterparty', ALICE)
    assert.fieldEquals('EarnEvent', inn, 'position', positionId(TUSDC, BOB))
  })

  test('swap through the PoolManager writes only the user-side row', () => {
    handleEarnTransferHelper(transferEvent(TUSDC, ADDRESS_ZERO, ALICE, '1000000', 200, 1, TX_A))

    // sell: user -> PoolManager
    mockConvertToAssets(TUSDC, '100000', '100002')
    handleEarnTransferHelper(transferEvent(TUSDC, ALICE, POOL_MANAGER, '100000', 300, 10, TX_B))
    // buy back: PoolManager -> user
    mockConvertToAssets(TUSDC, '99978', '99980')
    handleEarnTransferHelper(transferEvent(TUSDC, POOL_MANAGER, ALICE, '99978', 301, 2, TX_C))

    assert.notInStore('EarnPosition', positionId(TUSDC, POOL_MANAGER))
    const id = positionId(TUSDC, ALICE)
    assert.fieldEquals('EarnPosition', id, 'shares', '999978')
    assert.fieldEquals('EarnPosition', id, 'transferredOut', '100002')
    assert.fieldEquals('EarnPosition', id, 'transferredIn', '99980')
    assert.fieldEquals('EarnVault', TUSDC, 'earnShares', '999978')
    assert.fieldEquals('EarnVault', TUSDC, 'protocolShares', '22')

    assert.entityCount('EarnEvent', 2)
    assert.fieldEquals('EarnEvent', earnEventId(TX_B, 10) + '-out', 'counterparty', POOL_MANAGER)
    assert.notInStore('EarnEvent', earnEventId(TX_B, 10) + '-in')
    assert.fieldEquals('EarnEvent', earnEventId(TX_C, 2) + '-in', 'counterparty', POOL_MANAGER)
    assert.notInStore('EarnEvent', earnEventId(TX_C, 2) + '-out')
  })

  test('transfers to and from a strategy vault write only the user-side row', () => {
    handleEarnTransferHelper(transferEvent(TUSDC, ADDRESS_ZERO, ALICE, '1000000', 200, 1, TX_A))

    mockConvertToAssets(TUSDC, '100000', '100002')
    handleEarnTransferHelper(transferEvent(TUSDC, ALICE, STRATEGY_VAULT, '100000', 300, 10, TX_B))
    mockConvertToAssets(TUSDC, '40000', '40001')
    handleEarnTransferHelper(transferEvent(TUSDC, STRATEGY_VAULT, ALICE, '40000', 301, 2, TX_C))

    assert.notInStore('EarnPosition', positionId(TUSDC, STRATEGY_VAULT))
    const id = positionId(TUSDC, ALICE)
    assert.fieldEquals('EarnPosition', id, 'shares', '940000')
    assert.fieldEquals('EarnPosition', id, 'transferredOut', '100002')
    assert.fieldEquals('EarnPosition', id, 'transferredIn', '40001')
    assert.fieldEquals('EarnVault', TUSDC, 'earnShares', '940000')
    assert.fieldEquals('EarnVault', TUSDC, 'protocolShares', '60000')

    assert.entityCount('EarnEvent', 2)
    assert.fieldEquals('EarnEvent', earnEventId(TX_B, 10) + '-out', 'counterparty', STRATEGY_VAULT)
    assert.notInStore('EarnEvent', earnEventId(TX_B, 10) + '-in')
    assert.fieldEquals('EarnEvent', earnEventId(TX_C, 2) + '-in', 'counterparty', STRATEGY_VAULT)
    assert.notInStore('EarnEvent', earnEventId(TX_C, 2) + '-out')
  })

  test('self transfer changes nothing and writes no EarnEvent (documented behavior)', () => {
    handleEarnTransferHelper(transferEvent(TUSDC, ADDRESS_ZERO, ALICE, '1000000', 200, 1, TX_A))
    // no convertToAssets mock for 500000: the handler must not even value a self transfer
    handleEarnTransferHelper(transferEvent(TUSDC, ALICE, ALICE, '500000', 300, 1, TX_B))

    const id = positionId(TUSDC, ALICE)
    assert.fieldEquals('EarnPosition', id, 'shares', '1000000')
    assert.fieldEquals('EarnPosition', id, 'transferredIn', '0')
    assert.fieldEquals('EarnPosition', id, 'transferredOut', '0')
    assert.fieldEquals('EarnPosition', id, 'transferInCount', '0')
    assert.fieldEquals('EarnPosition', id, 'transferOutCount', '0')
    assert.entityCount('EarnEvent', 0)
  })

  test('convertToAssets revert falls back to the sharePrice snapshot', () => {
    handleEarnTransferHelper(transferEvent(TUSDC, ADDRESS_ZERO, ALICE, '1000000', 200, 1, TX_A))
    createMockedFunction(Address.fromString(TUSDC), 'convertToAssets', 'convertToAssets(uint256):(uint256)')
      .withArgs([ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(200000))])
      .reverts()
    handleEarnTransferHelper(transferEvent(TUSDC, ALICE, BOB, '200000', 300, 3, TX_B))

    // 200000 * 1000023 / 1e6 = 200004 (floor)
    assert.fieldEquals('EarnPosition', positionId(TUSDC, ALICE), 'transferredOut', '200004')
    assert.fieldEquals('EarnPosition', positionId(TUSDC, BOB), 'transferredIn', '200004')
    assert.fieldEquals('EarnVault', TUSDC, 'valuationFallbackCount', '1')
    assert.fieldEquals('EarnEvent', earnEventId(TX_B, 3) + '-out', 'valuationSource', 'SNAPSHOT')
    assert.fieldEquals('EarnEvent', earnEventId(TX_B, 3) + '-in', 'valuationSource', 'SNAPSHOT')
  })

  test('zero-value transfer is ignored', () => {
    handleEarnTransferHelper(transferEvent(TUSDC, ALICE, BOB, '0', 300, 1, TX_B))
    assert.entityCount('EarnPosition', 0)
    assert.entityCount('EarnEvent', 0)
  })

  test('mixed sequence keeps sum(position.shares) == earnShares and earnShares + protocolShares == totalSupply', () => {
    handleEarnTransferHelper(transferEvent(TUSDC, ADDRESS_ZERO, POOL_MANAGER, '9000000', 200, 1, TX_A))
    handleEarnTransferHelper(transferEvent(TUSDC, ADDRESS_ZERO, ALICE, '1000000', 200, 2, TX_A))
    mockConvertToAssets(TUSDC, '300000', '300006')
    handleEarnTransferHelper(transferEvent(TUSDC, ALICE, BOB, '300000', 201, 1, TX_B))
    mockConvertToAssets(TUSDC, '120000', '120002')
    handleEarnTransferHelper(transferEvent(TUSDC, POOL_MANAGER, BOB, '120000', 202, 1, TX_C))
    handleEarnTransferHelper(transferEvent(TUSDC, BOB, ADDRESS_ZERO, '20000', 203, 1, TX_C))

    const alice = EarnPosition.load(positionId(TUSDC, ALICE))!
    const bob = EarnPosition.load(positionId(TUSDC, BOB))!
    const vault = EarnVault.load(TUSDC)!
    assert.bigIntEquals(alice.shares.plus(bob.shares), vault.earnShares)
    assert.bigIntEquals(vault.earnShares.plus(vault.protocolShares), vault.totalSupply)
    assert.bigIntEquals(BigInt.fromString('9980000'), vault.totalSupply)
    assert.bigIntEquals(BigInt.fromString('8880000'), vault.protocolShares)
  })
})

describe('0xD417 real base-sepolia fixture', () => {
  beforeEach(() => {
    dataSourceMock.setNetwork(BASE_SEPOLIA)
  })

  afterEach(() => {
    clearStore()
    dataSourceMock.resetValues()
  })

  test('tUSDC: 1 deposit + 18 swaps via the PoolManager; shares match on-chain balanceOf', () => {
    mockVaultMetadata(D417_TUSDC_VAULT, 'tUSDC', AAVE_USDC, 'USDC')
    handleSetConfigTokenizeHelper(setConfigTokenizeEvent(D417_TUSDC_VAULT, IB_USDC, AAVE_USDC, 100))
    replay(D417_TUSDC_VAULT, D417_TUSDC_EVENTS)

    const id = positionId(D417_TUSDC_VAULT, D417_USER)
    // independent check: tUSDC.balanceOf(0xD417) at the last event block
    assert.fieldEquals('EarnPosition', id, 'shares', D417_TUSDC_BALANCE_AT_FINAL_BLOCK)
    assert.fieldEquals('EarnPosition', id, 'deposited', '2000000')
    assert.fieldEquals('EarnPosition', id, 'withdrawn', '0')
    // 9 x convertToAssets(99978) = 9 x 99980, 9 x convertToAssets(100000) = 9 x 100002
    assert.fieldEquals('EarnPosition', id, 'transferredIn', '899820')
    assert.fieldEquals('EarnPosition', id, 'transferredOut', '900018')
    assert.fieldEquals('EarnPosition', id, 'transferInCount', '9')
    assert.fieldEquals('EarnPosition', id, 'transferOutCount', '9')
    assert.fieldEquals('EarnPosition', id, 'firstDepositBlock', '61125210')
    assert.fieldEquals('EarnPosition', id, 'lastUpdatedBlock', '62383476')

    // net principal (computed by the client) = 2000000 + 899820 - 0 - 900018
    const position = EarnPosition.load(id)!
    const net = position.deposited.plus(position.transferredIn).minus(position.withdrawn).minus(position.transferredOut)
    assert.bigIntEquals(BigInt.fromString('1999802'), net)

    // 1 DEPOSIT + 9 TRANSFER_OUT + 9 TRANSFER_IN, none for the PoolManager, none for the mint
    assert.entityCount('EarnEvent', 19)
    assert.i32Equals(position.events.load().length, 19)
    assert.notInStore('EarnPosition', positionId(D417_TUSDC_VAULT, POOL_MANAGER))
    assert.fieldEquals(
      'EarnEvent',
      earnEventId('0xca2865570c371c9b541f79deccd2a87ff9334a38f63455ffbea04d39babb2ac3', 19),
      'type',
      'DEPOSIT',
    )
    assert.notInStore(
      'EarnEvent',
      earnEventId('0xca2865570c371c9b541f79deccd2a87ff9334a38f63455ffbea04d39babb2ac3', 18),
    )
    assert.fieldEquals('EarnVault', D417_TUSDC_VAULT, 'sharePrice', '1000027')
  })

  test('tUSDT: position acquired only through swaps, fully exited', () => {
    mockVaultMetadata(D417_TUSDT_VAULT, 'tUSDT', AAVE_USDT, 'USDT')
    handleSetConfigTokenizeHelper(setConfigTokenizeEvent(D417_TUSDT_VAULT, IB_USDT, AAVE_USDT, 100))
    replay(D417_TUSDT_VAULT, D417_TUSDT_EVENTS)

    const id = positionId(D417_TUSDT_VAULT, D417_USER)
    assert.fieldEquals('EarnPosition', id, 'shares', D417_TUSDT_BALANCE_AT_FINAL_BLOCK)
    assert.fieldEquals('EarnPosition', id, 'deposited', '0')
    assert.fieldEquals('EarnPosition', id, 'transferredIn', '900837')
    assert.fieldEquals('EarnPosition', id, 'transferredOut', '900837')
    assert.fieldEquals('EarnPosition', id, 'firstActivityBlock', '61125276')
    const position = EarnPosition.load(id)!
    const firstDepositBlock = position.firstDepositBlock
    assert.assertTrue(firstDepositBlock === null)
    assert.fieldEquals('EarnVault', D417_TUSDT_VAULT, 'activePositionCount', '0')
    assert.fieldEquals('EarnVault', D417_TUSDT_VAULT, 'positionCount', '1')
    assert.entityCount('EarnEvent', 18)
    const first = EarnEvent.load(earnEventId(D417_TUSDT_EVENTS[0].txHash, D417_TUSDT_EVENTS[0].logIndex) + '-in')!
    assert.stringEquals('TRANSFER_IN', first.type)
  })
})
