import { assert, describe, test } from 'matchstick-as'

import { SubgraphConfig } from '../../src/utils/chains'
import { ADDRESS_ZERO } from '../../src/utils/constants'
import { isKnownToken, isPoolAllowed } from '../../src/utils/poolAllowlist'
import { TEST_CONFIG } from '../handlers/constants'

const WETH = '0x4200000000000000000000000000000000000006'
const USDC = '0xba50cd2a20f6da35d788639e581bca8d0b5d4d5f'
const TUSDC = '0x0b4104691a6a006f0134d507aae6d35854bad924'
const TWETH = '0xd09edda7a0495eac6b921fb9408d2ae55220ebc0'
const RANDOM_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const RANDOM_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

const PRICE_POOL = '0x025d03111ace126acfa746647812b6e921f950821df269826b73ccffebec9814'
const EXTRA_POOL = '0x00000000000000000000000000000000000000000000000000000000000000ee'
const OTHER_POOL = '0x00000000000000000000000000000000000000000000000000000000000000ff'

// TEST_CONFIG with the restriction switched on and a small known-token set
function restrictedConfig(): SubgraphConfig {
  return {
    poolManagerAddress: TEST_CONFIG.poolManagerAddress,
    stablecoinWrappedNativePoolId: PRICE_POOL,
    stablecoinIsToken0: true,
    wrappedNativeAddress: WETH,
    minimumNativeLocked: TEST_CONFIG.minimumNativeLocked,
    stablecoinAddresses: [USDC],
    whitelistTokens: TEST_CONFIG.whitelistTokens,
    tokenOverrides: TEST_CONFIG.tokenOverrides,
    poolsToSkip: [],
    restrictPoolsToKnownTokens: true,
    allowedPoolIds: [EXTRA_POOL],
    poolMappings: [],
    nativeTokenDetails: TEST_CONFIG.nativeTokenDetails,
    tokenizes: [
      [TWETH, WETH],
      [TUSDC, USDC],
    ],
    kittycornBankAddress: TEST_CONFIG.kittycornBankAddress,
    kittycornPositionManagerAddress: TEST_CONFIG.kittycornPositionManagerAddress,
    kittycornMigratorAddress: TEST_CONFIG.kittycornMigratorAddress,
  }
}

describe('isKnownToken', () => {
  test('native, wrapped native, stablecoins, tokenize tokens and their underlyings are known', () => {
    const config = restrictedConfig()
    assert.assertTrue(isKnownToken(ADDRESS_ZERO, config))
    assert.assertTrue(isKnownToken(WETH, config))
    assert.assertTrue(isKnownToken(USDC, config))
    assert.assertTrue(isKnownToken(TUSDC, config))
    assert.assertTrue(isKnownToken(TWETH, config))
  })

  test('anything else is unknown', () => {
    assert.assertTrue(!isKnownToken(RANDOM_A, restrictedConfig()))
  })
})

describe('isPoolAllowed', () => {
  test('allows every pool while the restriction is off (arbitrum-one behaviour)', () => {
    assert.assertTrue(isPoolAllowed(OTHER_POOL, RANDOM_A, RANDOM_B, TEST_CONFIG))
  })

  test('always keeps the native price pool, whatever its currencies', () => {
    assert.assertTrue(isPoolAllowed(PRICE_POOL, RANDOM_A, RANDOM_B, restrictedConfig()))
  })

  test('keeps explicitly listed pool ids', () => {
    assert.assertTrue(isPoolAllowed(EXTRA_POOL, RANDOM_A, RANDOM_B, restrictedConfig()))
  })

  test('keeps pools whose two currencies are both known', () => {
    const config = restrictedConfig()
    assert.assertTrue(isPoolAllowed(OTHER_POOL, TUSDC, TWETH, config))
    assert.assertTrue(isPoolAllowed(OTHER_POOL, ADDRESS_ZERO, USDC, config))
    assert.assertTrue(isPoolAllowed(OTHER_POOL, USDC, WETH, config))
  })

  test('skips pools with at least one unknown currency', () => {
    const config = restrictedConfig()
    assert.assertTrue(!isPoolAllowed(OTHER_POOL, RANDOM_A, RANDOM_B, config))
    assert.assertTrue(!isPoolAllowed(OTHER_POOL, WETH, RANDOM_B, config))
    assert.assertTrue(!isPoolAllowed(OTHER_POOL, RANDOM_A, TUSDC, config))
  })
})
