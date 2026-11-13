import { SubgraphConfig } from './chains'
import { ADDRESS_ZERO } from './constants'

/**
 * A token the subgraph can price without scanning arbitrary pools: native, wrapped native,
 * a configured stablecoin, or a tokenize token / its underlying. All addresses are lowercase hex.
 */
export function isKnownToken(address: string, config: SubgraphConfig): boolean {
  if (address == ADDRESS_ZERO || address == config.wrappedNativeAddress) {
    return true
  }
  if (config.stablecoinAddresses.includes(address)) {
    return true
  }
  for (let i = 0; i < config.tokenizes.length; i++) {
    // each entry is [tokenize, underlying]
    if (config.tokenizes[i].includes(address)) {
      return true
    }
  }
  return false
}

/**
 * Decides in handleInitialize whether a pool is indexed at all. Pools that are skipped here never get a
 * Pool entity, so every later Swap / ModifyLiquidity on them returns early and none of their
 * ticks, transactions or day/hour rows are written.
 *
 * Always allowed: the stablecoin / wrapped-native pool that prices the native token, and any pool id
 * listed in allowedPoolIds (e.g. collateral pools whose currencies are not all known tokens).
 */
export function isPoolAllowed(poolId: string, currency0: string, currency1: string, config: SubgraphConfig): boolean {
  if (!config.restrictPoolsToKnownTokens) {
    return true
  }
  if (poolId == config.stablecoinWrappedNativePoolId || config.allowedPoolIds.includes(poolId)) {
    return true
  }
  return isKnownToken(currency0, config) && isKnownToken(currency1, config)
}
