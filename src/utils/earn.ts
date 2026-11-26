import { Address } from '@graphprotocol/graph-ts'

import { SubgraphConfig } from './chains'

function matches(address: Address, configured: string): boolean {
  // '' marks a contract that is not deployed on this network
  return configured.length > 0 && address.equals(Address.fromString(configured))
}

// True for addresses that hold tTokens on behalf of the protocol and therefore never get an EarnPosition or an
// EarnEvent: the zero address (mint/burn), the vault itself, the Bank that registered the vault (margin escrow),
// the PoolManager (LP liquidity, swap counterparty) and the Kittycorn PositionManager / Migrator / Router /
// Universal Router wrapper / Market (transient balances while minting, redeeming or routing).
//
// The check runs per side of a Transfer: a wallet that swaps tTokens through the PoolManager is still booked,
// only the PoolManager side is skipped.
//
// `bank` is the Bank that emitted SetConfigTokenize for this vault (stored on EarnVault.bank), so the Earn exclusion
// follows the manifest Bank address without a second copy. config.kittycornBankAddress is checked as well.
export function isEarnExcludedAddress(
  address: Address,
  vault: Address,
  bank: Address,
  config: SubgraphConfig,
): boolean {
  if (address.equals(Address.zero())) return true
  if (address.equals(vault)) return true
  if (address.equals(bank)) return true
  if (matches(address, config.kittycornBankAddress)) return true
  if (matches(address, config.poolManagerAddress)) return true
  if (matches(address, config.kittycornPositionManagerAddress)) return true
  if (matches(address, config.kittycornMigratorAddress)) return true
  if (matches(address, config.kittycornRouterAddress)) return true
  if (matches(address, config.universalRouterAddress)) return true
  if (matches(address, config.kittycornMarketAddress)) return true
  return false
}

export function earnPositionId(vault: Address, user: Address): string {
  return vault.toHexString() + '-' + user.toHexString()
}
