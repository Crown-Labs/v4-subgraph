import { BigDecimal, BigInt } from '@graphprotocol/graph-ts'

import { exponentToBigDecimal, safeDiv } from '../utils/index'
import { Bundle, Pool, Token } from './../types/schema'
import { ADDRESS_ZERO, ONE_BD, ZERO_BD, ZERO_BI } from './constants'
import { NativeTokenDetails } from './nativeTokenDetails'

const Q192 = BigInt.fromI32(2).pow(192 as u8)
export function sqrtPriceX96ToTokenPrices(
  sqrtPriceX96: BigInt,
  token0: Token,
  token1: Token,
  nativeTokenDetails: NativeTokenDetails,
): BigDecimal[] {
  const token0Decimals = token0.id == ADDRESS_ZERO ? nativeTokenDetails.decimals : token0.decimals
  const token1Decimals = token1.id == ADDRESS_ZERO ? nativeTokenDetails.decimals : token1.decimals

  const num = sqrtPriceX96.times(sqrtPriceX96).toBigDecimal()
  const denom = BigDecimal.fromString(Q192.toString())
  const price1 = num.div(denom).times(exponentToBigDecimal(token0Decimals)).div(exponentToBigDecimal(token1Decimals))

  const price0 = safeDiv(BigDecimal.fromString('1'), price1)
  return [price0, price1]
}

export function getNativePriceInUSD(stablecoinWrappedNativePoolId: string, stablecoinIsToken0: boolean): BigDecimal {
  const stablecoinWrappedNativePool = Pool.load(stablecoinWrappedNativePoolId)
  if (stablecoinWrappedNativePool !== null) {
    return stablecoinIsToken0 ? stablecoinWrappedNativePool.token0Price : stablecoinWrappedNativePool.token1Price
  } else {
    return ZERO_BD
  }
}

/**
 * Search through graph to find derived Eth per token.
 * @todo update to be derived ETH (add stablecoin estimates)
 **/
export function findNativePerToken(
  token: Token,
  wrappedNativeAddress: string,
  stablecoinAddresses: string[],
  minimumNativeLocked: BigDecimal,
): BigDecimal {
  if (token.id == wrappedNativeAddress || token.id == ADDRESS_ZERO) {
    return ONE_BD
  }
  const whiteList = token.whitelistPools
  // for now just take USD from pool with greatest TVL
  // need to update this to actually detect best rate based on liquidity distribution
  let largestLiquidityETH = ZERO_BD
  let priceSoFar = ZERO_BD
  const bundle = Bundle.load('1')!

  // hardcoded fix for incorrect rates
  // if whitelist includes token - get the safe price
  if (stablecoinAddresses.includes(token.id)) {
    priceSoFar = safeDiv(ONE_BD, bundle.ethPriceUSD)
  } else {
    for (let i = 0; i < whiteList.length; ++i) {
      const poolAddress = whiteList[i]
      const pool = Pool.load(poolAddress)

      if (pool) {
        if (pool.liquidity.gt(ZERO_BI)) {
          if (pool.token0 == token.id) {
            // whitelist token is token1
            const token1 = Token.load(pool.token1)
            // get the derived ETH in pool
            if (token1) {
              const ethLocked = pool.totalValueLockedToken1.times(token1.derivedETH)
              if (ethLocked.gt(largestLiquidityETH) && ethLocked.gt(minimumNativeLocked)) {
                largestLiquidityETH = ethLocked
                // token1 per our token * Eth per token1
                priceSoFar = pool.token1Price.times(token1.derivedETH as BigDecimal)
              }
            }
          }
          if (pool.token1 == token.id) {
            const token0 = Token.load(pool.token0)
            // get the derived ETH in pool
            if (token0) {
              const ethLocked = pool.totalValueLockedToken0.times(token0.derivedETH)
              if (ethLocked.gt(largestLiquidityETH) && ethLocked.gt(minimumNativeLocked)) {
                largestLiquidityETH = ethLocked
                // token0 per our token * ETH per token0
                priceSoFar = pool.token0Price.times(token0.derivedETH as BigDecimal)
              }
            }
          }
        }
      }
    }
  }
  return priceSoFar
}

/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist
 * If one token on whitelist, return amount in that token converted to USD * 2.
 * If both are, return sum of two amounts
 * If neither is, return 0
 */
export function getTrackedAmountUSD(
  tokenAmount0: BigDecimal,
  token0: Token,
  tokenAmount1: BigDecimal,
  token1: Token,
  whitelistTokens: string[],
): BigDecimal {
  const bundle = Bundle.load('1')!
  const price0USD = token0.derivedETH.times(bundle.ethPriceUSD)
  const price1USD = token1.derivedETH.times(bundle.ethPriceUSD)

  // both are whitelist tokens, return sum of both amounts
  if (whitelistTokens.includes(token0.id) && whitelistTokens.includes(token1.id)) {
    return tokenAmount0.times(price0USD).plus(tokenAmount1.times(price1USD))
  }

  // take double value of the whitelisted token amount
  if (whitelistTokens.includes(token0.id) && !whitelistTokens.includes(token1.id)) {
    return tokenAmount0.times(price0USD).times(BigDecimal.fromString('2'))
  }

  // take double value of the whitelisted token amount
  if (!whitelistTokens.includes(token0.id) && whitelistTokens.includes(token1.id)) {
    return tokenAmount1.times(price1USD).times(BigDecimal.fromString('2'))
  }

  // neither token is on white list, tracked amount is 0
  return ZERO_BD
}

export function calculateAmountUSD(
  amount0: BigDecimal,
  amount1: BigDecimal,
  token0DerivedETH: BigDecimal,
  token1DerivedETH: BigDecimal,
  ethPriceUSD: BigDecimal,
): BigDecimal {
  return amount0.times(token0DerivedETH.times(ethPriceUSD)).plus(amount1.times(token1DerivedETH.times(ethPriceUSD)))
}

/**
 * derivedETH for a tokenize token. The underlying's stored derivedETH is only refreshed when a pool
 * containing the underlying itself is swapped, so copying it would pin the tokenize token to a
 * stale native price (observed: tUSDC priced at ~$2 while ethPriceUSD had moved). Recompute it from
 * the current Bundle instead. Stablecoin and wrapped-native underlyings need no Token entity at all;
 * other underlyings fall back to findNativePerToken over their whitelisted pools. Returns null when
 * the token is not a tokenize token or (for the fallback) its underlying Token does not exist yet.
 */
export function getTokenizeDerivedETH(
  tokenizeAddress: string,
  tokenizeConfig: Array<string[]>,
  wrappedNativeAddress: string,
  stablecoinAddresses: string[],
  minimumNativeLocked: BigDecimal,
): BigDecimal | null {
  const underlyingAddress = getTokenizeUnderlyingAddress(tokenizeAddress, tokenizeConfig)
  if (underlyingAddress === null) {
    return null
  }
  if (underlyingAddress == wrappedNativeAddress || underlyingAddress == ADDRESS_ZERO) {
    return ONE_BD
  }
  if (stablecoinAddresses.includes(underlyingAddress)) {
    return safeDiv(ONE_BD, Bundle.load('1')!.ethPriceUSD)
  }
  const underlying = Token.load(underlyingAddress)
  if (underlying === null) {
    return null
  }
  return findNativePerToken(underlying, wrappedNativeAddress, stablecoinAddresses, minimumNativeLocked)
}

/**
 * A stablecoin's derivedETH is 1 / ethPriceUSD, but findNativePerToken only rewrites it when a pool
 * holding that stablecoin emits an event. Where those pools are idle (Base Sepolia: the Aave USDC/USDT
 * pools) the stored value pins the stablecoin, and everything priced through it, to an old native price
 * (observed: USDC at $2.09, USDT at $7.52 while ethPriceUSD had moved). Call this whenever ethPriceUSD
 * changes, i.e. on a swap in the stablecoin / wrapped-native pool. Tokens in `skip` are the ones the
 * caller already holds and saves itself.
 */
export function refreshStablecoinDerivedETH(
  stablecoinAddresses: string[],
  ethPriceUSD: BigDecimal,
  skip: string[],
): void {
  const derivedETH = safeDiv(ONE_BD, ethPriceUSD)
  for (let i = 0; i < stablecoinAddresses.length; i++) {
    const address = stablecoinAddresses[i]
    if (skip.includes(address)) {
      continue
    }
    const token = Token.load(address)
    if (token === null) {
      continue
    }
    token.derivedETH = derivedETH
    token.totalValueLockedUSD = token.totalValueLocked.times(derivedETH).times(ethPriceUSD)
    token.save()
  }
}

/** Lowercase underlying address for a tokenize token, or null when the address is not a tokenize token. */
export function getTokenizeUnderlyingAddress(tokenizeAddress: string, tokenizeConfig: Array<string[]>): string | null {
  const tokenizeAddressLower = tokenizeAddress.toLowerCase()
  for (let i = 0; i < tokenizeConfig.length; i++) {
    if (tokenizeAddressLower == tokenizeConfig[i][0].toLowerCase()) {
      return tokenizeConfig[i][1].toLowerCase()
    }
  }
  return null
}

export function getTokenizeRefToken(tokenizeAddress: string, tokenizeConfig: Array<string[]>): Token | null {
  const underlyingAddress = getTokenizeUnderlyingAddress(tokenizeAddress, tokenizeConfig)
  return underlyingAddress === null ? null : Token.load(underlyingAddress)
}
