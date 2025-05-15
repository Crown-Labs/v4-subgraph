import { Bytes, log } from '@graphprotocol/graph-ts'

import { SetConfigBorrowToken as SetConfigBorrowTokenEvent } from '../types/KittycornBank/KittycornBank'
import { BorrowAsset, LiquidatePosition, LiquidationPositionDaily, Token } from '../types/schema'
import { getSubgraphConfig, SubgraphConfig } from '../utils/chains'
import { ONE_BI, ZERO_BD, ZERO_BI } from '../utils/constants'
import { fetchTokenDecimals, fetchTokenName, fetchTokenSymbol, fetchTokenTotalSupply } from '../utils/token'
// The subgraph handler must have this signature to be able to handle events,
// however, we invoke a helper in order to inject dependencies for unit tests.
export function handleConfigBorrowToken(event: SetConfigBorrowTokenEvent): void {
  handleConfigBorrowTokenHelper(event)
}

export function handleLiquidatePosition(/*event: LiquidatePositionEvent*/): void {
  handleLiquidatePositionHelper()
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

export function handleLiquidatePositionHelper(/*event: LiquidatePositionEvent*/): void {
  // concat positionId and tokenId
  const positionId = '1' //event.params.positionId.toHexString()
  const tokenId = '1' //event.params.tokenId.toHexString()
  const id = positionId + '-' + tokenId

  let position = LiquidatePosition.load(id)

  if (position === null) {
    position = new LiquidatePosition(id)
  }
  // position.positionId = event.params.positionId
  // position.tokenId = event.params.tokenId
  // position.owner = event.params.owner
  // position.liquidator = event.transaction.from
  // position.repayToken = event.params.repayToken
  // position.liquidatePrice = event.params.liquidatePrice
  // position.positionValue = event.params.positionValue
  // position.liquidateFeeValue = event.params.liquidateFeeValue
  // position.protocolFee = event.params.protocolFee

  position.positionId = ONE_BI
  position.tokenId = ONE_BI
  position.owner = Bytes.fromHexString('0xABEDb1E852b21b512b2d5B2B5DCdA877069FB2C8') as Bytes
  position.liquidator = Bytes.fromHexString('0xABEDb1E852b21b512b2d5B2B5DCdA877069FB2C8') as Bytes
  position.repayToken = Bytes.fromHexString('0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0') as Bytes
  position.liquidatePrice = ONE_BI
  position.positionValue = ONE_BI
  position.liquidateFeeValue = ONE_BI
  position.protocolFee = ONE_BI

  position.save()

  // const timestamp = event.block.timestamp.toI32()

  const timestampMock = 1746500000 + 86400 * 4
  const timestamp = timestampMock

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
  // positionDaily.totalCount = positionDaily.totalCount.plus(ONE_BI)
  // positionDaily.liquidateValueAccumulate = positionDaily.liquidateValueAccumulate.plus(position.positionValue)
  // positionDaily.liquidateFeeValueAccumulate = positionDaily.liquidateFeeValueAccumulate.plus(position.liquidateFeeValue)
  // positionDaily.protocolFeeAccumulate = positionDaily.protocolFeeAccumulate.plus(position.protocolFee)

  // mock data
  positionDaily.totalCount = positionDaily.totalCount.plus(ONE_BI)
  positionDaily.liquidateValueAccumulate = positionDaily.liquidateValueAccumulate.plus(ONE_BI)
  positionDaily.liquidateFeeValueAccumulate = positionDaily.liquidateFeeValueAccumulate.plus(ONE_BI)
  positionDaily.protocolFeeAccumulate = positionDaily.protocolFeeAccumulate.plus(ONE_BI)

  positionDaily.save()
}
