import { log } from '@graphprotocol/graph-ts'

import {
  LiquidatePosition as LiquidatePositionEvent,
  SetConfigBorrowToken as SetConfigBorrowTokenEvent,
} from '../types/KittycornBank/KittycornBank'
import { BorrowAsset, Token } from '../types/schema'
import { getSubgraphConfig, SubgraphConfig } from '../utils/chains'
import { ZERO_BD, ZERO_BI } from '../utils/constants'
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

export function handleLiquidatePositionHelper(event: LiquidatePositionEvent): void {
  // concat positionId and tokenId
  const positionId = event.params.positionId.toHexString()
  log.info('positionId {}', [positionId])

  // const tokenId = event.params.tokenId.toHexString()
  // const id = tokenId + '-' + positionId
  // log.info('1=====================', [])
  // let position = LiquidatePosition.load(id)
  // log.info('2=====================', [])
  // if (position === null) {
  //   log.info('3=====================', [])
  //   log.info('positionId: {}, tokenId: {}', [positionId, tokenId])
  //   position = new LiquidatePosition(id)
  //   position.positionId = ZERO_BI
  //   position.tokenId = ZERO_BI
  //   position.owner = Bytes.fromHexString('0x00')
  //   position.liquidator = Bytes.fromHexString('')
  //   position.repayToken = Bytes.fromHexString('')
  //   position.liquidatePrice = ZERO_BI
  //   position.positionValue = ZERO_BI
  //   position.repayValue = ZERO_BI
  //   position.liquidateFeeValue = ZERO_BI
  //   position.protocolFee = ZERO_BI
  //   position.txHash = Bytes.fromHexString('')
  //   position.timestamp = ZERO_BI
  //   log.info('4=====================', [])
  // }
  // log.info('5=====================', [])
  // position.positionId = event.params.positionId
  // position.tokenId = event.params.tokenId
  // position.owner = event.params.owner
  // position.liquidator = event.transaction.from
  // position.repayToken = event.params.repayToken
  // position.liquidatePrice = event.params.liquidatePrice
  // position.positionValue = event.params.positionValue
  // position.repayValue = event.params.liquidateRepayAmount
  // position.liquidateFeeValue = event.params.liquidateFeeValue
  // position.protocolFee = event.params.protocolFee
  // position.txHash = event.transaction.hash
  // position.timestamp = event.block.timestamp

  // position.positionId = ONE_BI
  // position.tokenId = ONE_BI
  // position.owner = Bytes.fromHexString('0xABEDb1E852b21b512b2d5B2B5DCdA877069FB2C8') as Bytes
  // position.liquidator = Bytes.fromHexString('0xABEDb1E852b21b512b2d5B2B5DCdA877069FB2C8') as Bytes
  // position.repayToken = Bytes.fromHexString('0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0') as Bytes
  // position.liquidatePrice = ONE_BI
  // position.positionValue = ONE_BI
  // position.repayValue = ONE_BI
  // position.liquidateFeeValue = ONE_BI
  // position.protocolFee = ONE_BI
  // position.txHash = Bytes.fromHexString('0x64879147b1c1003297cbafdcb15751bd042995ce325f61cc8a6664efc927cc0e') as Bytes
  // position.timestamp = ZERO_BI
  // log.info('6=====================', [])
  // position.save()

  // const timestamp = event.block.timestamp.toI32()

  // const timestampMock = 1746500000 + 86400 * 4
  // const timestamp = timestampMock

  // const dayID = timestamp / 86400 // rounded
  // const dayStartTimestamp = dayID * 86400
  // log.info('7=====================', [])
  // let positionDaily = LiquidationPositionDaily.load(dayStartTimestamp.toString())
  // if (positionDaily === null) {
  //   log.info('8=====================', [])
  //   positionDaily = new LiquidationPositionDaily(dayStartTimestamp.toString())
  //   positionDaily.totalCount = ZERO_BI
  //   positionDaily.liquidateValueAccumulate = ZERO_BI
  //   positionDaily.liquidateFeeValueAccumulate = ZERO_BI
  //   positionDaily.protocolFeeAccumulate = ZERO_BI
  //   log.info('9=====================', [])
  // }
  // // positionDaily.totalCount = positionDaily.totalCount.plus(ONE_BI)
  // // positionDaily.liquidateValueAccumulate = positionDaily.liquidateValueAccumulate.plus(position.positionValue)
  // // positionDaily.liquidateFeeValueAccumulate = positionDaily.liquidateFeeValueAccumulate.plus(position.liquidateFeeValue)
  // // positionDaily.protocolFeeAccumulate = positionDaily.protocolFeeAccumulate.plus(position.protocolFee)
  // log.info('10=====================', [])
  // // mock data
  // positionDaily.totalCount = positionDaily.totalCount.plus(ONE_BI)
  // positionDaily.liquidateValueAccumulate = positionDaily.liquidateValueAccumulate.plus(ONE_BI)
  // positionDaily.liquidateFeeValueAccumulate = positionDaily.liquidateFeeValueAccumulate.plus(ONE_BI)
  // positionDaily.protocolFeeAccumulate = positionDaily.protocolFeeAccumulate.plus(ONE_BI)
  // log.info('11=====================', [])

  // positionDaily.save()
}
