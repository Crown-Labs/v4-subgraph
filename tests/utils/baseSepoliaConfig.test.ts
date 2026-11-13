import { Address, BigDecimal, BigInt, Bytes, ethereum } from '@graphprotocol/graph-ts'
import {
  afterEach,
  assert,
  beforeEach,
  clearStore,
  createMockedFunction,
  dataSourceMock,
  describe,
  test,
} from 'matchstick-as'

import { handleModifyLiquidityHelper } from '../../src/mappings/modifyLiquidity'
import { handleInitializeHelper } from '../../src/mappings/poolManager'
import { Initialize, ModifyLiquidity } from '../../src/types/PoolManager/PoolManager'
import { Bundle, PoolManager, Token } from '../../src/types/schema'
import { ADDRESS_ZERO } from '../../src/utils/constants'
import { MOCK_EVENT } from '../handlers/constants'

// Exercises the real base-sepolia config from src/utils/chains.ts (no injected TEST_CONFIG).
const BASE_SEPOLIA_NETWORK = 'base-sepolia'

const USDC_ADDRESS = '0x036cbd53842c5426634e7929541ec2318f3dcf7e'
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006'
const TWETH_ADDRESS = '0xd09edda7a0495eac6b921fb9408d2ae55220ebc0'
const TUSDC_ADDRESS = '0x0b4104691a6a006f0134d507aae6d35854bad924'

// USDC/WETH 1% reference pool (stablecoinWrappedNativePoolId)
const REFERENCE_POOL_ID = '0x025d03111ace126acfa746647812b6e921f950821df269826b73ccffebec9814'
const REFERENCE_POOL_SQRT_PRICE_X96 = '1825068347415163811313605517900399'
const REFERENCE_POOL_TICK = 200905

// Arbitrary id for a tUSDC/tWETH pool
const TOKENIZED_POOL_ID = '0x00000000000000000000000000000000000000000000000000000000000000aa'
// A public pool between two tokens the config knows nothing about (no ERC20 mocks on purpose:
// an eth_call for them would make matchstick fail, which proves the allowlist runs first)
const UNKNOWN_POOL_ID = '0x00000000000000000000000000000000000000000000000000000000000000bb'
const UNKNOWN_TOKEN_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const UNKNOWN_TOKEN_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const Q96 = '79228162514264337593543950336' // sqrtPriceX96 for price 1, tick 0

function mockErc20(address: string, symbol: string, decimals: i32): void {
  const token = Address.fromString(address)
  createMockedFunction(token, 'symbol', 'symbol():(string)').returns([ethereum.Value.fromString(symbol)])
  createMockedFunction(token, 'name', 'name():(string)').returns([ethereum.Value.fromString(symbol)])
  createMockedFunction(token, 'totalSupply', 'totalSupply():(uint256)').returns([
    ethereum.Value.fromUnsignedBigInt(BigInt.fromString('1000000')),
  ])
  createMockedFunction(token, 'decimals', 'decimals():(uint32)').returns([
    ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(decimals)),
  ])
}

function initializePool(
  poolId: string,
  currency0: string,
  currency1: string,
  fee: i32,
  tickSpacing: i32,
  sqrtPriceX96: string,
  tick: i32,
): void {
  const event = new Initialize(
    MOCK_EVENT.address,
    MOCK_EVENT.logIndex,
    MOCK_EVENT.transactionLogIndex,
    MOCK_EVENT.logType,
    MOCK_EVENT.block,
    MOCK_EVENT.transaction,
    [
      new ethereum.EventParam('id', ethereum.Value.fromFixedBytes(Bytes.fromHexString(poolId) as Bytes)),
      new ethereum.EventParam('currency0', ethereum.Value.fromAddress(Address.fromString(currency0))),
      new ethereum.EventParam('currency1', ethereum.Value.fromAddress(Address.fromString(currency1))),
      new ethereum.EventParam('fee', ethereum.Value.fromI32(fee)),
      new ethereum.EventParam('tickSpacing', ethereum.Value.fromI32(tickSpacing)),
      new ethereum.EventParam('hooks', ethereum.Value.fromAddress(Address.fromString(ADDRESS_ZERO))),
      new ethereum.EventParam('sqrtPriceX96', ethereum.Value.fromUnsignedBigInt(BigInt.fromString(sqrtPriceX96))),
      new ethereum.EventParam('tick', ethereum.Value.fromI32(tick)),
    ],
    MOCK_EVENT.receipt,
  )
  handleInitializeHelper(event)
}

function modifyLiquidity(poolId: string): void {
  const event = new ModifyLiquidity(
    MOCK_EVENT.address,
    MOCK_EVENT.logIndex,
    MOCK_EVENT.transactionLogIndex,
    MOCK_EVENT.logType,
    MOCK_EVENT.block,
    MOCK_EVENT.transaction,
    [
      new ethereum.EventParam('id', ethereum.Value.fromFixedBytes(Bytes.fromHexString(poolId) as Bytes)),
      new ethereum.EventParam(
        'sender',
        ethereum.Value.fromAddress(Address.fromString('0x1111111111111111111111111111111111111111')),
      ),
      new ethereum.EventParam('tickLower', ethereum.Value.fromI32(-600)),
      new ethereum.EventParam('tickUpper', ethereum.Value.fromI32(600)),
      new ethereum.EventParam('liquidityDelta', ethereum.Value.fromSignedBigInt(BigInt.fromString('1000000000000'))),
      new ethereum.EventParam(
        'salt',
        ethereum.Value.fromFixedBytes(
          Bytes.fromHexString('0x0000000000000000000000000000000000000000000000000000000000000000') as Bytes,
        ),
      ),
    ],
    MOCK_EVENT.receipt,
  )
  handleModifyLiquidityHelper(event)
}

function initializeReferencePool(): void {
  initializePool(
    REFERENCE_POOL_ID,
    USDC_ADDRESS,
    WETH_ADDRESS,
    10000,
    200,
    REFERENCE_POOL_SQRT_PRICE_X96,
    REFERENCE_POOL_TICK,
  )
}

describe('base-sepolia config', () => {
  beforeEach(() => {
    dataSourceMock.setNetwork(BASE_SEPOLIA_NETWORK)
    mockErc20(USDC_ADDRESS, 'USDC', 6)
    mockErc20(WETH_ADDRESS, 'WETH', 18)
    mockErc20(TUSDC_ADDRESS, 'tUSDC', 6)
    mockErc20(TWETH_ADDRESS, 'tWETH', 18)
  })

  afterEach(() => {
    clearStore()
    dataSourceMock.resetValues()
  })

  test('reference pool USDC/WETH 1% sets bundle.ethPriceUSD', () => {
    initializeReferencePool()

    const ethPriceUSD = Bundle.load('1')!.ethPriceUSD
    assert.assertTrue(
      ethPriceUSD.gt(BigDecimal.fromString('1884.51')) && ethPriceUSD.lt(BigDecimal.fromString('1884.53')),
      'ethPriceUSD should be ~1884.52, got ' + ethPriceUSD.toString(),
    )
    assert.fieldEquals('Token', WETH_ADDRESS, 'derivedETH', '1')
  })

  test('tWETH derivedETH follows WETH after ModifyLiquidity on a tWETH pool', () => {
    initializeReferencePool()
    initializePool(TOKENIZED_POOL_ID, TUSDC_ADDRESS, TWETH_ADDRESS, 3000, 60, Q96, 0)

    // tokenized tokens skip findNativePerToken on Initialize
    assert.fieldEquals('Token', TWETH_ADDRESS, 'derivedETH', '0')

    modifyLiquidity(TOKENIZED_POOL_ID)

    assert.fieldEquals('Token', TWETH_ADDRESS, 'derivedETH', Token.load(WETH_ADDRESS)!.derivedETH.toString())
    assert.fieldEquals('Token', TWETH_ADDRESS, 'derivedETH', '1')
  })

  test('skips a pool between unknown tokens without creating entities or calling the tokens', () => {
    initializePool(UNKNOWN_POOL_ID, UNKNOWN_TOKEN_A, UNKNOWN_TOKEN_B, 3000, 60, Q96, 0)

    assert.notInStore('Pool', UNKNOWN_POOL_ID)
    assert.notInStore('Token', UNKNOWN_TOKEN_A)
    assert.notInStore('Token', UNKNOWN_TOKEN_B)
    assert.entityCount('PoolDayData', 0)
  })

  test('keeps the PoolManager and Bundle singletons when the first pool seen is skipped', () => {
    initializePool(UNKNOWN_POOL_ID, UNKNOWN_TOKEN_A, UNKNOWN_TOKEN_B, 3000, 60, Q96, 0)

    assert.fieldEquals('PoolManager', PoolManager.load('0x05e73354cfdd6745c338b50bcfdfa3aa6fa03408')!.id, 'poolCount', '0')
    assert.fieldEquals('Bundle', '1', 'ethPriceUSD', '0')

    // later handlers on the skipped pool must return quietly instead of hitting a null assert
    modifyLiquidity(UNKNOWN_POOL_ID)
    assert.entityCount('ModifyLiquidity', 0)
    assert.entityCount('Transaction', 0)
  })

  test('still indexes the reference pool and tokenize pools with the allowlist on', () => {
    initializeReferencePool()
    initializePool(TOKENIZED_POOL_ID, TUSDC_ADDRESS, TWETH_ADDRESS, 3000, 60, Q96, 0)

    assert.fieldEquals('Pool', REFERENCE_POOL_ID, 'id', REFERENCE_POOL_ID)
    assert.fieldEquals('Pool', TOKENIZED_POOL_ID, 'id', TOKENIZED_POOL_ID)
    assert.fieldEquals('PoolManager', '0x05e73354cfdd6745c338b50bcfdfa3aa6fa03408', 'poolCount', '2')
  })
})
