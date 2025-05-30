import { BigInt, log } from '@graphprotocol/graph-ts'

import {
  EnableCollateral as EnableCollateralEvent,
  LiquidatePosition as LiquidatePositionEvent,
  SetConfigBorrowToken as SetConfigBorrowTokenEvent,
} from '../types/KittycornBank/KittycornBank'
import { BorrowAsset, LiquidatePosition, LiquidatePositionDaily, LiquidityPosition, Pool, Token } from '../types/schema'
import { exponentToBigDecimal } from '../utils'
import { getSubgraphConfig, SubgraphConfig } from '../utils/chains'
import { ONE_BI, ZERO_BD, ZERO_BI } from '../utils/constants'
import { fetchTokenDecimals, fetchTokenName, fetchTokenSymbol, fetchTokenTotalSupply } from '../utils/token'
// The subgraph handler must have this signature to be able to handle events,
// however, we invoke a helper in order to inject dependencies for unit tests.
export function handleConfigBorrowToken(event: SetConfigBorrowTokenEvent): void {
  handleConfigBorrowTokenHelper(event)
}

export function handleLiquidatePosition(event: LiquidatePositionEvent): void {
  handleLiquidatePositionHelper(event)
}

export function handleEnableCollateral(event: EnableCollateralEvent): void {
  handleEnableCollateralHelper(event)
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

  const liquidityPosition = LiquidityPosition.load(tokenId)

  if (liquidityPosition === null) {
    log.error('handleLiquidatePositionHelper: liquidityPosition not found for tokenId {}', [tokenId])
    return
  }

  const pool = Pool.load(liquidityPosition.pool)
  if (pool === null) {
    log.error('handleLiquidatePositionHelper: pool not found for poolId {}', [liquidityPosition.pool])
    return
  }

  let repayToken = Token.load(event.params.repayToken.toHexString())
  if (repayToken === null) {
    repayToken = new Token(event.params.repayToken.toHexString())
    repayToken.symbol = fetchTokenSymbol(
      event.params.repayToken,
      subgraphConfig.tokenOverrides,
      subgraphConfig.nativeTokenDetails,
    )
    repayToken.name = fetchTokenName(
      event.params.repayToken,
      subgraphConfig.tokenOverrides,
      subgraphConfig.nativeTokenDetails,
    )
    repayToken.totalSupply = fetchTokenTotalSupply(event.params.repayToken)
    const decimals = fetchTokenDecimals(
      event.params.repayToken,
      subgraphConfig.tokenOverrides,
      subgraphConfig.nativeTokenDetails,
    )

    // bail if we couldn't figure out the decimals
    if (decimals === null) {
      log.debug('mybug the decimal on repay token was null', [])
      return
    }

    repayToken.decimals = decimals
    repayToken.derivedETH = ZERO_BD
    repayToken.volume = ZERO_BD
    repayToken.volumeUSD = ZERO_BD
    repayToken.feesUSD = ZERO_BD
    repayToken.untrackedVolumeUSD = ZERO_BD
    repayToken.totalValueLocked = ZERO_BD
    repayToken.totalValueLockedUSD = ZERO_BD
    repayToken.totalValueLockedUSDUntracked = ZERO_BD
    repayToken.txCount = ZERO_BI
    repayToken.poolCount = ZERO_BI
    repayToken.whitelistPools = []
  }

  // load token0 and token1
  const token0 = Token.load(pool.token0)
  const token1 = Token.load(pool.token1)

  if (token0 === null || token1 === null || repayToken === null) {
    log.error('handleLiquidatePositionHelper: token0 or token1 not found for poolId {}', [liquidityPosition.pool])
    return
  }

  const id = tokenId + '-' + positionId

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

  const liqPosition = new LiquidatePosition(id)
  liqPosition.tokenId = event.params.tokenId
  liqPosition.positionId = event.params.positionId
  liqPosition.owner = event.params.owner.toHexString()
  liqPosition.liquidator = event.transaction.from.toHexString()
  liqPosition.repayToken = repayToken.id
  liqPosition.liquidatePrice = event.params.liquidatePrice
  liqPosition.positionValue = event.params.positionValue
  liqPosition.repayValue = BigInt.fromString(repayValue.toString())
  liqPosition.liquidateFeeValue = event.params.liquidateFeeValue
  liqPosition.protocolFee = event.params.protocolFee
  liqPosition.txHash = event.transaction.hash.toHexString()
  liqPosition.timestamp = event.block.timestamp
  liqPosition.token0 = token0.id
  liqPosition.token1 = token1.id
  liqPosition.feeTier = pool.feeTier
  liqPosition.tickSpacing = pool.tickSpacing
  liqPosition.hooks = pool.hooks
  liqPosition.tickLower = liquidityPosition.tickLower
  liqPosition.tickUpper = liquidityPosition.tickUpper
  liqPosition.sqrtPrice = pool.sqrtPrice
  liqPosition.tick = ZERO_BI
  liqPosition.poolId = pool.id

  const timestamp = event.block.timestamp.toI32()

  const dayID = timestamp / 86400 // rounded
  const dayStartTimestamp = dayID * 86400

  let positionDaily = LiquidatePositionDaily.load(dayStartTimestamp.toString())
  if (positionDaily === null) {
    positionDaily = new LiquidatePositionDaily(dayStartTimestamp.toString())
    positionDaily.totalCount = ZERO_BI
    positionDaily.liquidateValueAccumulate = ZERO_BI
    positionDaily.liquidateFeeValueAccumulate = ZERO_BI
    positionDaily.protocolFeeAccumulate = ZERO_BI
  }
  positionDaily.totalCount = positionDaily.totalCount.plus(ONE_BI)
  positionDaily.liquidateValueAccumulate = positionDaily.liquidateValueAccumulate.plus(liqPosition.positionValue)
  positionDaily.liquidateFeeValueAccumulate = positionDaily.liquidateFeeValueAccumulate.plus(
    liqPosition.liquidateFeeValue,
  )
  positionDaily.protocolFeeAccumulate = positionDaily.protocolFeeAccumulate.plus(liqPosition.protocolFee)

  liqPosition.save()
  positionDaily.save()
  repayToken.save()
}

export function handleEnableCollateralHelper(event: EnableCollateralEvent): void {
  return
  // const tokenOverrides = subgraphConfig.tokenOverrides
  // const nativeTokenDetails = subgraphConfig.nativeTokenDetails
  // log.info('handleEnableCollateralHelper', [])
  // log.info('event.params.tokenId: {}, event.params.positionId: {}', [
  //   event.params.tokenId.toString(),
  //   event.params.positionId.toString(),
  // ])

  event.params.tokenId.toString()
  // const positionId = event.params.positionId.toString()

  // const id = tokenId + '-' + positionId
  // let bankPosition = BankPosition.load(id)
  // if (bankPosition === null) {
  //   bankPosition = new BankPosition(id)
  //   bankPosition.tokenId = ZERO_BI
  //   bankPosition.positionId = ZERO_BI
  //   bankPosition.currency0 = ADDRESS_ZERO
  //   bankPosition.currency1 = ADDRESS_ZERO
  //   bankPosition.fee = ZERO_BI
  //   bankPosition.tickSpacing = ZERO_BI
  //   bankPosition.hooks = ADDRESS_ZERO
  //   bankPosition.positionInfo = ZERO_BI
  // }

  // fetch poolKey by tokenId
  // const poolKey = fetchGetPoolAndPositionInfo(
  //   Address.fromString(subgraphConfig.kittycornPositionManagerAddress),
  //   event.params.tokenId,
  // )
  // if (poolKey === null) {
  //   log.debug('mybug the poolKey was null', [])
  //   return
  // }
  // load token0 and token1
  // let token0 = Token.load(poolKey.currency0)
  // let token1 = Token.load(poolKey.currency1)

  // fetch info if null
  // if (token0 === null) {
  //   // log.info('token0=============================================', [])
  //   token0 = new Token(poolKey.currency0)
  //   token0.symbol = fetchTokenSymbol(Address.fromString(poolKey.currency0), tokenOverrides, nativeTokenDetails)
  //   token0.name = fetchTokenName(Address.fromString(poolKey.currency0), tokenOverrides, nativeTokenDetails)
  //   token0.totalSupply = fetchTokenTotalSupply(Address.fromString(poolKey.currency0))
  //   const decimals = fetchTokenDecimals(Address.fromString(poolKey.currency0), tokenOverrides, nativeTokenDetails)

  //   // bail if we couldn't figure out the decimals
  //   if (decimals === null) {
  //     log.debug('mybug the decimal on token 0 was null', [])
  //     return
  //   }

  //   token0.decimals = decimals
  //   token0.derivedETH = ZERO_BD
  //   token0.volume = ZERO_BD
  //   token0.volumeUSD = ZERO_BD
  //   token0.feesUSD = ZERO_BD
  //   token0.untrackedVolumeUSD = ZERO_BD
  //   token0.totalValueLocked = ZERO_BD
  //   token0.totalValueLockedUSD = ZERO_BD
  //   token0.totalValueLockedUSDUntracked = ZERO_BD
  //   token0.txCount = ZERO_BI
  //   token0.poolCount = ZERO_BI
  //   token0.whitelistPools = []
  // }
  // if (token1 === null) {
  //   // log.info('token1=============================================', [])
  //   token1 = new Token(poolKey.currency1)
  //   token1.symbol = fetchTokenSymbol(Address.fromString(poolKey.currency1), tokenOverrides, nativeTokenDetails)
  //   token1.name = fetchTokenName(Address.fromString(poolKey.currency1), tokenOverrides, nativeTokenDetails)
  //   token1.totalSupply = fetchTokenTotalSupply(Address.fromString(poolKey.currency1))
  //   const decimals = fetchTokenDecimals(Address.fromString(poolKey.currency1), tokenOverrides, nativeTokenDetails)

  //   if (decimals === null) {
  //     log.debug('mybug the decimal on token 1 was null', [])
  //     return
  //   }

  //   token1.decimals = decimals
  //   token1.derivedETH = ZERO_BD
  //   token1.volume = ZERO_BD
  //   token1.volumeUSD = ZERO_BD
  //   token1.untrackedVolumeUSD = ZERO_BD
  //   token1.feesUSD = ZERO_BD
  //   token1.totalValueLocked = ZERO_BD
  //   token1.totalValueLockedUSD = ZERO_BD
  //   token1.totalValueLockedUSDUntracked = ZERO_BD
  //   token1.txCount = ZERO_BI
  //   token1.poolCount = ZERO_BI
  //   token1.whitelistPools = []
  // }
  // log.info('handleEnableCollateralHelper: token0.id: {}', [Address.fromString(token0.id).toHexString()])
  // log.info('handleEnableCollateralHelper: token1.id: {}', [Address.fromString(token1.id).toHexString()])
  // log.info('handleEnableCollateralHelper: poolKey.fee: {}', [poolKey.fee.toString()])
  // log.info('handleEnableCollateralHelper: poolKey.tickSpacing: {}', [poolKey.tickSpacing.toString()])
  // log.info('handleEnableCollateralHelper: poolKey.hooks: {}', [Address.fromString(poolKey.hooks).toHexString()])

  // bankPosition.tokenId = event.params.tokenId
  // bankPosition.positionId = event.params.positionId
  // bankPosition.currency0 = Address.fromString(token0.id).toHexString()
  // bankPosition.currency1 = Address.fromString(token1.id).toHexString()
  // bankPosition.fee = poolKey.fee
  // bankPosition.tickSpacing = poolKey.tickSpacing
  // bankPosition.hooks = poolKey.hooks.toHexString()
  // bankPosition.positionInfo = poolKey.positionInfo

  // log.info('handleEnableCollateralHelper: bankPosition: {}', [bankPosition.id])
  // log.info('handleEnableCollateralHelper: bankPosition.tokenId: {}, bankPosition.positionId: {}', [
  //   bankPosition.tokenId.toString(),
  //   bankPosition.positionId.toString(),
  // ])
  // log.info('handleEnableCollateralHelper: bankPosition.currency0: {}, bankPosition.currency1: {}', [
  //   bankPosition.currency0,
  //   bankPosition.currency1,
  // ])
  // log.info('handleEnableCollateralHelper: bankPosition.fee: {}, bankPosition.tickSpacing: {}', [
  //   bankPosition.fee.toString(),
  //   bankPosition.tickSpacing.toString(),
  // ])

  // bankPosition.tokenId = BigInt.fromString('1')
  // bankPosition.positionId = BigInt.fromString('1')
  // bankPosition.currency0 = ADDRESS_ZERO
  // bankPosition.currency1 = ADDRESS_ZERO
  // bankPosition.fee = ZERO_BI
  // bankPosition.tickSpacing = ZERO_BI
  // bankPosition.hooks = ADDRESS_ZERO
  // token0.save()
  // token1.save()
  // bankPosition.save()
}
