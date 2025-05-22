import { BigInt, log } from '@graphprotocol/graph-ts'

import {
  LiquidatePosition as LiquidatePositionEvent,
  SetConfigBorrowToken as SetConfigBorrowTokenEvent,
} from '../types/KittycornBank/KittycornBank'
import { BorrowAsset, LiquidatePosition, LiquidationPositionDaily, Token } from '../types/schema'
import { exponentToBigDecimal } from '../utils'
import { getSubgraphConfig, SubgraphConfig } from '../utils/chains'
import { ADDRESS_ZERO, ONE_BI, ZERO_BD, ZERO_BI } from '../utils/constants'
import { fetchTokenDecimals, fetchTokenName, fetchTokenSymbol, fetchTokenTotalSupply } from '../utils/token'
// The subgraph handler must have this signature to be able to handle events,
// however, we invoke a helper in order to inject dependencies for unit tests.
export function handleConfigBorrowToken(event: SetConfigBorrowTokenEvent): void {
  handleConfigBorrowTokenHelper(event)
}

export function handleLiquidatePosition(event: LiquidatePositionEvent): void {
  handleLiquidatePositionHelper(event)
}

export function handleConfigBorrowTokenHelper(
  event: SetConfigBorrowTokenEvent,
  subgraphConfig: SubgraphConfig = getSubgraphConfig(),
): void {
  const assetId = event.params.ulToken.toHexString()
  const allowBorrow = event.params.allowBorrow
  const borrowFee = event.params.borrowFee

  const tokenOverrides = subgraphConfig.tokenOverrides
  const nativeTokenDetails = subgraphConfig.nativeTokenDetails

  let token = Token.load(assetId)

  // fetch info if null
  if (token === null) {
    token = new Token(assetId)
    token.symbol = fetchTokenSymbol(event.params.ulToken, tokenOverrides, nativeTokenDetails)
    token.name = fetchTokenName(event.params.ulToken, tokenOverrides, nativeTokenDetails)
    token.totalSupply = fetchTokenTotalSupply(event.params.ulToken)
    const decimals = fetchTokenDecimals(event.params.ulToken, tokenOverrides, nativeTokenDetails)

    // bail if we couldn't figure out the decimals
    if (decimals === null) {
      log.debug('mybug the decimal on token was null', [])
      return
    }

    token.decimals = decimals
    token.derivedETH = ZERO_BD
    token.volume = ZERO_BD
    token.volumeUSD = ZERO_BD
    token.feesUSD = ZERO_BD
    token.untrackedVolumeUSD = ZERO_BD
    token.totalValueLocked = ZERO_BD
    token.totalValueLockedUSD = ZERO_BD
    token.totalValueLockedUSDUntracked = ZERO_BD
    token.txCount = ZERO_BI
    token.poolCount = ZERO_BI
    token.whitelistPools = []
  }

  let borrowAsset = BorrowAsset.load(assetId)
  if (borrowAsset === null) {
    borrowAsset = new BorrowAsset(assetId)
    borrowAsset.token = token.id
    borrowAsset.totalSupply = ZERO_BI
    borrowAsset.supplyAPY = ZERO_BI
    borrowAsset.borrowAPY = ZERO_BI
    borrowAsset.borrowFee = ZERO_BI
  }
  borrowAsset.allowBorrow = allowBorrow
  borrowAsset.borrowFee = borrowFee

  token.save()
  borrowAsset.save()
}

export function handleLiquidatePositionHelper(
  event: LiquidatePositionEvent,
  subgraphConfig: SubgraphConfig = getSubgraphConfig(),
): void {
  // concat tokenId and positionId
  const tokenId = event.params.tokenId.toString()
  const positionId = event.params.positionId.toString()

  const id = tokenId + '-' + positionId
  let position = LiquidatePosition.load(id)

  if (position === null) {
    position = new LiquidatePosition(id)
    position.positionId = ZERO_BI
    position.tokenId = ZERO_BI
    position.owner = ADDRESS_ZERO
    position.liquidator = ADDRESS_ZERO
    position.repayToken = ADDRESS_ZERO
    position.liquidatePrice = ZERO_BI
    position.positionValue = ZERO_BI
    position.repayValue = ZERO_BI
    position.liquidateFeeValue = ZERO_BI
    position.protocolFee = ZERO_BI
    position.txHash = ADDRESS_ZERO
    position.timestamp = ZERO_BI
  }
  const decimalsToken = fetchTokenDecimals(
    event.params.repayToken,
    subgraphConfig.tokenOverrides,
    subgraphConfig.nativeTokenDetails,
  )
  // bail if we couldn't figure out the decimals
  if (decimalsToken === null) {
    log.debug('mybug the decimal on token was null', [])
    return
  }

  // calculating repayValue with bigdecimal
  const repayValue = event.params.liquidateRepayAmount
    .toBigDecimal()
    .times(event.params.liquidatePrice.toBigDecimal())
    .div(exponentToBigDecimal(decimalsToken))

  position.positionId = event.params.positionId
  position.tokenId = event.params.tokenId
  position.owner = event.params.owner.toHexString()
  position.liquidator = event.transaction.from.toHexString()
  position.repayToken = event.params.repayToken.toHexString()
  position.liquidatePrice = event.params.liquidatePrice
  position.positionValue = event.params.positionValue
  position.repayValue = BigInt.fromString(repayValue.toString())
  position.liquidateFeeValue = event.params.liquidateFeeValue
  position.protocolFee = event.params.protocolFee
  position.txHash = event.transaction.hash.toHexString()
  position.timestamp = event.block.timestamp

  position.save()

  const timestamp = event.block.timestamp.toI32()

  const dayID = timestamp / 86400 // rounded
  const dayStartTimestamp = dayID * 86400

  let positionDaily = LiquidationPositionDaily.load(dayStartTimestamp.toString())
  if (positionDaily === null) {
    positionDaily = new LiquidationPositionDaily(dayStartTimestamp.toString())
    positionDaily.totalCount = ZERO_BI
    positionDaily.liquidateValueAccumulate = ZERO_BI
    positionDaily.liquidateFeeValueAccumulate = ZERO_BI
    positionDaily.protocolFeeAccumulate = ZERO_BI
  }
  positionDaily.totalCount = positionDaily.totalCount.plus(ONE_BI)
  positionDaily.liquidateValueAccumulate = positionDaily.liquidateValueAccumulate.plus(position.positionValue)
  positionDaily.liquidateFeeValueAccumulate = positionDaily.liquidateFeeValueAccumulate.plus(position.liquidateFeeValue)
  positionDaily.protocolFeeAccumulate = positionDaily.protocolFeeAccumulate.plus(position.protocolFee)

  positionDaily.save()
}
