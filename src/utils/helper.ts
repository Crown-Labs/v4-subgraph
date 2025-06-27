import { Address, log } from '@graphprotocol/graph-ts'

import { Token } from '../types/schema'
import { getSubgraphConfig, SubgraphConfig } from './chains'
import { ZERO_BD, ZERO_BI } from './constants'
import { fetchTokenDecimals, fetchTokenName, fetchTokenSymbol, fetchTokenTotalSupply } from './token'

export function getToken(address: string): Token | null {
  const tokenAddress = Address.fromString(address.toLowerCase())
  const tokenAddressToHex = tokenAddress.toHexString()
  const subgraphConfig: SubgraphConfig = getSubgraphConfig()
  const tokenOverrides = subgraphConfig.tokenOverrides
  const nativeTokenDetails = subgraphConfig.nativeTokenDetails

  let token = Token.load(tokenAddressToHex)
  // fetch info if null
  if (token === null) {
    token = new Token(tokenAddressToHex)
    token.symbol = fetchTokenSymbol(tokenAddress, tokenOverrides, nativeTokenDetails)
    token.name = fetchTokenName(tokenAddress, tokenOverrides, nativeTokenDetails)
    token.address = tokenAddressToHex
    token.totalSupply = fetchTokenTotalSupply(tokenAddress)
    const decimals = fetchTokenDecimals(tokenAddress, tokenOverrides, nativeTokenDetails)

    // bail if we couldn't figure out the decimals
    if (decimals === null) {
      log.debug('mybug the decimal on token was null', [])
      return null
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
    token.save()
  }
  return token
}
