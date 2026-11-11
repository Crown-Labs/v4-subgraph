import { Address, BigDecimal, BigInt, dataSource } from '@graphprotocol/graph-ts'

import { NativeTokenDetails } from './nativeTokenDetails'
import { StaticTokenDefinition } from './staticTokenDefinition'

// assemblyscript does not support string enums, hence these constants
const ARBITRUM_ONE_NETWORK_NAME = 'arbitrum-one'
// Note: All token and pool addresses should be lowercased!
export class SubgraphConfig {
  // deployment address
  poolManagerAddress: string

  // the address of a pool where one token is a stablecoin and the other is a
  // token that tracks the price of the native token use this to calculate the
  // price of the native token, so prefer a pool with highest liquidity
  stablecoinWrappedNativePoolId: string

  // true is stablecoin is token0, false if stablecoin is token1
  stablecoinIsToken0: boolean

  // the address of a token that tracks the price of the native token, most of
  // the time, this is a wrapped asset but could also be the native token itself
  // for some chains
  wrappedNativeAddress: string

  // the mimimum liquidity in a pool needed for it to be used to help calculate
  // token prices. for new chains, this should be initialized to ~4000 USD
  minimumNativeLocked: BigDecimal

  // list of stablecoin addresses
  stablecoinAddresses: string[]

  // a token must be in a pool with one of these tokens in order to derive a
  // price (in addition to passing the minimumEthLocked check). This is also
  // used to determine whether volume is tracked or not.
  whitelistTokens: string[]

  tokenizes: Array<string[]>

  // token overrides are used to override RPC calls for the symbol, name, and
  // decimals for tokens. for new chains this is typically empty.
  tokenOverrides: StaticTokenDefinition[]

  // skip the creation of these pools in handlePoolCreated. for new chains this is typically empty.
  poolsToSkip: string[]

  // initialize this list of pools and token addresses on factory creation. for new chains this is typically empty.
  poolMappings: Array<Address[]>

  // native token details for the chain.
  nativeTokenDetails: NativeTokenDetails

  // address of the kittycorn bank contract
  kittycornBankAddress: string

  // address of the kittycorn position manager contract
  kittycornPositionManagerAddress: string

  // address of the kittycorn migrator contract
  kittycornMigratorAddress: string
}

export function getSubgraphConfig(): SubgraphConfig {
  // Update this value to the corresponding chain you want to deploy
  const selectedNetwork = dataSource.network()

  if (selectedNetwork == ARBITRUM_ONE_NETWORK_NAME) {
    return {
      poolManagerAddress: '0x360e68faccca8ca495c1b759fd9eee466db9fb32',
      stablecoinWrappedNativePoolId: '0xfc7b3ad139daaf1e9c3637ed921c154d1b04286f8a82b805a6c352da57028653', // <- WETH-USDC 0.05% https://app.uniswap.org/explore/pools/arbitrum/0xfc7b3ad139daaf1e9c3637ed921c154d1b04286f8a82b805a6c352da57028653
      stablecoinIsToken0: false,
      wrappedNativeAddress: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', // WETH
      minimumNativeLocked: BigDecimal.fromString('1'),
      stablecoinAddresses: [
        '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8', // USDC.e
        '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1', // DAI
        '0xaf88d065e77c8cc2239327c5edb3a432268e5831', // USDC
        '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', // USDT
      ],
      whitelistTokens: [
        '0x0000000000000000000000000000000000000000', // Native ETH
        '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8', // USDC.e
        '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1', // DAI
        '0xaf88d065e77c8cc2239327c5edb3a432268e5831', // USDC
        '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', // USDT,
        '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', // WETH
        '0xba5ddd1f9d7f570dc94a51479a000e3bce967196', // AAVE
        '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f', // WBTC
        '0xf97f4df75117a78c1a5a0dbb814af92458539fb4', // LINK
        '0x3ed9d2e07d314f2dca05f920ed5cbf2dff60bc9a', // tAAVE
        '0x8fecd0452bbf493c4915834e75310a5e8fe1fdde', // tWBTC
        '0xcfdab139da7252ec3d8df14f03659a46d1d1848c', // tWETH
        '0xdd816723cf1b310d1755156c4f37b4c8ed54ed5c', // tLINK
        '0x43297fbd1306f9fcdf96ee3a27e0113e4295d738', // tUSDC
        '0x93ee5b16f4dde4566b94488b8d929f39df112f60', // tUSDT
      ],
      tokenizes: [
        ['0x3ed9d2e07d314f2dca05f920ed5cbf2dff60bc9a', '0xba5ddd1f9d7f570dc94a51479a000e3bce967196'], // tAAVE
        ['0x8fecd0452bbf493c4915834e75310a5e8fe1fdde', '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f'], // tWBTC
        ['0xcfdab139da7252ec3d8df14f03659a46d1d1848c', '0x82af49447d8a07e3bd95bd0d56f35241523fbab1'], // tWETH
        ['0xdd816723cf1b310d1755156c4f37b4c8ed54ed5c', '0xf97f4df75117a78c1a5a0dbb814af92458539fb4'], // tLINK
        ['0x43297fbd1306f9fcdf96ee3a27e0113e4295d738', '0xaf88d065e77c8cc2239327c5edb3a432268e5831'], // tUSDC
        ['0x93ee5b16f4dde4566b94488b8d929f39df112f60', '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9'], // tUSDT
      ],
      tokenOverrides: [
        {
          address: Address.fromString('0x82af49447d8a07e3bd95bd0d56f35241523fbab1'),
          symbol: 'WETH',
          name: 'Wrapped Ethereum',
          decimals: BigInt.fromI32(18),
        },
        {
          address: Address.fromString('0xff970a61a04b1ca14834a43f5de4533ebddb5cc8'),
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: BigInt.fromI32(6),
        },
      ],
      poolsToSkip: [],
      poolMappings: [],
      nativeTokenDetails: {
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: BigInt.fromI32(18),
      },
      kittycornBankAddress: '0xf0e778f51865b9c3bcbfe2b59ad19a12d6d1a0fc',
      kittycornPositionManagerAddress: '0x0989f4a52cc70099392b38e3d405e4f515d12630',
      kittycornMigratorAddress: '0xc78c603644b59ccbc869fa36b72ade24c9e04c40',
    }
  } else {
    throw new Error('Unsupported Network')
  }
}
