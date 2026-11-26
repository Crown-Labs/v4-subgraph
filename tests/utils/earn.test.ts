import { Address } from '@graphprotocol/graph-ts'
import { afterEach, assert, beforeEach, dataSourceMock, describe, test } from 'matchstick-as'

import { getSubgraphConfig, SubgraphConfig } from '../../src/utils/chains'
import { ADDRESS_ZERO } from '../../src/utils/constants'
import { earnPositionId, isEarnExcludedAddress } from '../../src/utils/earn'
import { TEST_CONFIG } from '../handlers/constants'

const VAULT = Address.fromString('0x9fffc7710fd0df623a4007904516db6b323710a7') // tUSDC
const BANK = Address.fromString('0x421cb4490c79727ec961c8fd214a98474425bdde') // Bank proxy
const OLD_BANK = '0xcc331ec1d6cf4542f9eb988b49249cfa163081dc' // pre-proxy Bank
const OTHER_BANK = Address.fromString('0x00000000000000000000000000000000000ba4c0')
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
    assert.assertTrue(excluded('0xd74e9c7d8299a54173db52e9e5d976050196a625', config)) // Kittycorn PositionManager
    assert.assertTrue(excluded('0x59287241a99b9020edc83788011384cf524697c3', config)) // Migrator
    assert.assertTrue(excluded('0xed7be201640f0a06defe6f13e6da1905137cc9e1', config)) // KittycornRouter
    assert.assertTrue(excluded('0x8a227466891feec628d6a9168806377464683656', config)) // Universal Router wrapper
  })

  test('strategy vaults are excluded', () => {
    const config = getSubgraphConfig()
    assert.i32Equals(3, config.earnExcludedExtraAddresses.length)
    assert.assertTrue(excluded('0x2757067620365066ddf03294db1c7fce00a961f6', config)) // kcETHHEDGE
    assert.assertTrue(excluded('0xbc4d353322b97c43a931906c051ca4aabf221309', config)) // kcETHLONG
    assert.assertTrue(excluded('0x85d7ba35f2c1b7be182294193c65152bd366964f', config)) // kcETHHOLD
    // checksummed input resolves to the same address
    assert.assertTrue(excluded('0x85d7BA35f2C1B7BE182294193C65152BD366964F', config))
  })

  test('contracts of the previous deployment are no longer excluded', () => {
    const config = getSubgraphConfig()
    assert.assertTrue(!excluded(OLD_BANK, config))
    assert.assertTrue(!excluded('0x8a2d75baadcd2c71b2acf715fc3da68964cea48e', config)) // old PositionManager
    assert.assertTrue(!excluded('0x3dd320984b954453d09f69b95d4c9f5bc92a9a58', config)) // old Migrator
    assert.assertTrue(!excluded('0x137a906e06ec20808c8f156f9024196427429220', config)) // old KittycornRouter
    assert.assertTrue(!excluded('0x02d353c5ca5e316bbd99fac6a481eb8b778ea67d', config)) // old Universal Router
  })

  test('a user wallet is not excluded', () => {
    assert.assertTrue(!excluded(USER.toHexString(), getSubgraphConfig()))
  })

  test('the Bank that registered the vault is excluded even if chains.ts has a different Bank', () => {
    const config = getSubgraphConfig()
    assert.assertTrue(excluded(OTHER_BANK.toHexString(), config, OTHER_BANK))
    // the Bank in chains.ts stays excluded too
    assert.assertTrue(excluded(BANK.toHexString(), config, OTHER_BANK))
  })
})

describe('isEarnExcludedAddress (empty optional addresses)', () => {
  test("'' entries match nothing", () => {
    // TEST_CONFIG has kittycornRouterAddress / universalRouterAddress / kittycornMarketAddress = '' and no
    // earnExcludedExtraAddresses
    assert.assertTrue(!excluded(USER.toHexString(), TEST_CONFIG))
    assert.assertTrue(!excluded('0x85d7ba35f2c1b7be182294193c65152bd366964f', TEST_CONFIG))
    assert.assertTrue(excluded(TEST_CONFIG.poolManagerAddress, TEST_CONFIG))
    assert.assertTrue(excluded(TEST_CONFIG.kittycornBankAddress, TEST_CONFIG))
  })

  test('position id is vault-user, lowercase', () => {
    assert.stringEquals(
      '0x9fffc7710fd0df623a4007904516db6b323710a7-0xd417e6728ce6efbf01ba5d52229ffd565d2e8ad0',
      earnPositionId(VAULT, USER),
    )
  })
})
