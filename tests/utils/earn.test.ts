import { Address } from '@graphprotocol/graph-ts'
import { afterEach, assert, beforeEach, dataSourceMock, describe, test } from 'matchstick-as'

import { getSubgraphConfig, SubgraphConfig } from '../../src/utils/chains'
import { ADDRESS_ZERO } from '../../src/utils/constants'
import { earnPositionId, isEarnExcludedAddress } from '../../src/utils/earn'
import { TEST_CONFIG } from '../handlers/constants'

const VAULT = Address.fromString('0x0b4104691a6a006f0134d507aae6d35854bad924')
const BANK = Address.fromString('0xcc331ec1d6cf4542f9eb988b49249cfa163081dc')
const NEW_BANK = Address.fromString('0x00000000000000000000000000000000000ba4c0')
const USER = Address.fromString('0xd417e6728ce6efbf01ba5d52229ffd565d2e8ad0')

function excluded(address: string, config: SubgraphConfig, bank: Address = BANK): boolean {
  return isEarnExcludedAddress(Address.fromString(address), VAULT, bank, config)
}

describe('isEarnExcludedAddress (base-sepolia config)', () => {
  beforeEach(() => {
    dataSourceMock.setNetwork('base-sepolia')
  })

  afterEach(() => {
    dataSourceMock.resetValues()
  })

  test('system addresses are excluded', () => {
    const config = getSubgraphConfig()
    assert.assertTrue(excluded(ADDRESS_ZERO, config))
    assert.assertTrue(excluded(VAULT.toHexString(), config))
    assert.assertTrue(excluded(BANK.toHexString(), config))
    assert.assertTrue(excluded('0x05e73354cfdd6745c338b50bcfdfa3aa6fa03408', config)) // PoolManager
    assert.assertTrue(excluded('0x8a2d75baadcd2c71b2acf715fc3da68964cea48e', config)) // Kittycorn PositionManager
    assert.assertTrue(excluded('0x3dd320984b954453d09f69b95d4c9f5bc92a9a58', config)) // Migrator
    assert.assertTrue(excluded('0x137a906e06ec20808c8f156f9024196427429220', config)) // KittycornRouter
    assert.assertTrue(excluded('0x02d353c5ca5e316bbd99fac6a481eb8b778ea67d', config)) // Universal Router wrapper
  })

  test('a user wallet is not excluded', () => {
    assert.assertTrue(!excluded(USER.toHexString(), getSubgraphConfig()))
  })

  test('the Bank that registered the vault is excluded even if chains.ts still has the old Bank', () => {
    const config = getSubgraphConfig()
    assert.assertTrue(excluded(NEW_BANK.toHexString(), config, NEW_BANK))
    // the old Bank in chains.ts stays excluded too
    assert.assertTrue(excluded(BANK.toHexString(), config, NEW_BANK))
  })
})

describe('isEarnExcludedAddress (empty optional addresses)', () => {
  test("'' entries match nothing", () => {
    // TEST_CONFIG has kittycornRouterAddress / universalRouterAddress / kittycornMarketAddress = ''
    assert.assertTrue(!excluded(USER.toHexString(), TEST_CONFIG))
    assert.assertTrue(excluded(TEST_CONFIG.poolManagerAddress, TEST_CONFIG))
    assert.assertTrue(excluded(TEST_CONFIG.kittycornBankAddress, TEST_CONFIG))
  })

  test('position id is vault-user, lowercase', () => {
    assert.stringEquals(
      '0x0b4104691a6a006f0134d507aae6d35854bad924-0xd417e6728ce6efbf01ba5d52229ffd565d2e8ad0',
      earnPositionId(VAULT, USER),
    )
  })
})
