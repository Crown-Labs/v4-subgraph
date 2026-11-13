import { BigDecimal } from '@graphprotocol/graph-ts'
import { afterEach, assert, beforeEach, clearStore, dataSourceMock, describe, test } from 'matchstick-as'

import { Bundle, PoolAllowCollateral, Token } from '../../src/types/schema'
import { ADDRESS_ZERO, ONE_BD } from '../../src/utils/constants'
import { safeDiv } from '../../src/utils/index'
import {
  AAVE_USDC_ADDRESS,
  AAVE_USDT_ADDRESS,
  ARBITRUM_ONE_NETWORK,
  BASE_SEPOLIA_KITTYCORN_PM,
  BASE_SEPOLIA_NETWORK,
  BASE_SEPOLIA_POOL_MANAGER,
  createUnderlyingUsdc,
  initializePool,
  initializeReferencePool,
  mockBaseSepoliaTokens,
  mockErc20,
  modifyLiquidity,
  NATIVE_USDC_POOL_ID,
  Q96,
  REFERENCE_POOL_ID,
  REFERENCE_POOL_SQRT_PRICE_X96_MOVED,
  setConfigCollateral,
  swap,
  TOKENIZED_POOL_ID,
  TUSDC_ADDRESS,
  TWETH_ADDRESS,
  UNKNOWN_POOL_ID,
  UNKNOWN_TOKEN_A,
  UNKNOWN_TOKEN_B,
  USDC_ADDRESS,
} from './baseSepoliaFixtures'

// Handler-level behaviour of the pool allowlist and the tokenize derivedETH refresh, run against the
// real base-sepolia (and, for one test, arbitrum-one) config from src/utils/chains.ts.
describe('allowlist: handlers on skipped or unknown pools (base-sepolia config)', () => {
  beforeEach(() => {
    dataSourceMock.setNetwork(BASE_SEPOLIA_NETWORK)
    mockBaseSepoliaTokens()
  })

  afterEach(() => {
    clearStore()
    dataSourceMock.resetValues()
  })

  test('handleSwap on a pool skipped by the allowlist is a no-op', () => {
    initializeReferencePool()
    initializePool(UNKNOWN_POOL_ID, UNKNOWN_TOKEN_A, UNKNOWN_TOKEN_B, Q96, 0)

    swap(UNKNOWN_POOL_ID, Q96, 0)

    assert.notInStore('Pool', UNKNOWN_POOL_ID)
    assert.entityCount('Swap', 0)
    assert.entityCount('Transaction', 0)
    assert.entityCount('PoolDayData', 1) // only the reference pool's row from Initialize
    assert.fieldEquals('PoolManager', BASE_SEPOLIA_POOL_MANAGER, 'txCount', '0')
    assert.fieldEquals('PoolManager', BASE_SEPOLIA_POOL_MANAGER, 'poolCount', '1')
  })

  test('handleSwap on an unknown pool before any PoolManager or Bundle exists does not crash', () => {
    // nothing initialised at all: Bundle.load('1')! / PoolManager.load(..)! must not run before the pool check
    swap(UNKNOWN_POOL_ID, Q96, 0)

    assert.entityCount('Swap', 0)
    assert.entityCount('Transaction', 0)
    assert.entityCount('PoolManager', 0)
    assert.entityCount('Bundle', 0)
  })

  test('handleModifyLiquidity on an unknown pool before any PoolManager or Bundle exists does not crash', () => {
    modifyLiquidity(UNKNOWN_POOL_ID)

    assert.entityCount('ModifyLiquidity', 0)
    assert.entityCount('Transaction', 0)
    assert.entityCount('Tick', 0)
    assert.entityCount('Bundle', 0)
  })

  test('a native ETH / USDC pool is allowed and the native token needs no eth_call', () => {
    initializePool(NATIVE_USDC_POOL_ID, ADDRESS_ZERO, USDC_ADDRESS, Q96, 0)

    assert.fieldEquals('Pool', NATIVE_USDC_POOL_ID, 'token0', ADDRESS_ZERO)
    assert.fieldEquals('Token', ADDRESS_ZERO, 'symbol', 'ETH')
    assert.fieldEquals('Token', ADDRESS_ZERO, 'derivedETH', '1')
    assert.fieldEquals('PoolManager', BASE_SEPOLIA_POOL_MANAGER, 'poolCount', '1')
  })

  test('SetConfigCollateral on a pool the allowlist skips keeps the PoolAllowCollateral but never links a Pool', () => {
    // documents current behaviour: such a pool must be put in allowedPoolIds to be indexed
    setConfigCollateral(UNKNOWN_POOL_ID)
    initializePool(UNKNOWN_POOL_ID, UNKNOWN_TOKEN_A, UNKNOWN_TOKEN_B, Q96, 0)

    assert.notInStore('Pool', UNKNOWN_POOL_ID)
    const collateral = PoolAllowCollateral.load(UNKNOWN_POOL_ID)!
    assert.assertNull(collateral.pool)
    assert.fieldEquals('KittycornPositionManager', BASE_SEPOLIA_KITTYCORN_PM, 'poolCount', '1')

    // and its liquidity / swaps are still ignored
    modifyLiquidity(UNKNOWN_POOL_ID)
    swap(UNKNOWN_POOL_ID, Q96, 0)
    assert.entityCount('ModifyLiquidity', 0)
    assert.entityCount('Swap', 0)
  })
})

describe('tokenize derivedETH refresh (base-sepolia config)', () => {
  beforeEach(() => {
    dataSourceMock.setNetwork(BASE_SEPOLIA_NETWORK)
    mockBaseSepoliaTokens()
  })

  afterEach(() => {
    clearStore()
    dataSourceMock.resetValues()
  })

  test('handleSwap on a tUSDC/tWETH pool prices tUSDC from the current ETH price, not the stored underlying', () => {
    initializeReferencePool()
    const ethPriceUSD = Bundle.load('1')!.ethPriceUSD
    const stale = BigDecimal.fromString('0.001107')
    createUnderlyingUsdc(stale)
    initializePool(TOKENIZED_POOL_ID, TUSDC_ADDRESS, TWETH_ADDRESS, Q96, 0)

    swap(TOKENIZED_POOL_ID, Q96, 0)

    const expected = safeDiv(ONE_BD, ethPriceUSD)
    assert.fieldEquals('Token', TUSDC_ADDRESS, 'derivedETH', expected.toString())
    assert.fieldEquals('Token', TWETH_ADDRESS, 'derivedETH', '1')
    // the same refreshed value must feed the pool's TVL in the same handler
    const tusdcTvl = Token.load(TUSDC_ADDRESS)!.totalValueLocked
    const twethTvl = Token.load(TWETH_ADDRESS)!.totalValueLocked
    assert.fieldEquals(
      'Pool',
      TOKENIZED_POOL_ID,
      'totalValueLockedETH',
      tusdcTvl.times(expected).plus(twethTvl).toString(),
    )
  })

  test('tUSDC derivedETH follows the Bundle when the reference pool price moves (the observed ~$2 tUSDC bug)', () => {
    initializeReferencePool()
    const ethPrice1 = Bundle.load('1')!.ethPriceUSD
    // the underlying was priced correctly at the time of its last own event ...
    createUnderlyingUsdc(safeDiv(ONE_BD, ethPrice1))
    initializePool(TOKENIZED_POOL_ID, TUSDC_ADDRESS, TWETH_ADDRESS, Q96, 0)
    modifyLiquidity(TOKENIZED_POOL_ID)
    assert.fieldEquals('Token', TUSDC_ADDRESS, 'derivedETH', safeDiv(ONE_BD, ethPrice1).toString())

    // ... then ETH moves on the reference pool, with no event on any pool holding the underlying
    swap(REFERENCE_POOL_ID, REFERENCE_POOL_SQRT_PRICE_X96_MOVED, 199550)
    const ethPrice2 = Bundle.load('1')!.ethPriceUSD
    assert.assertTrue(ethPrice2.notEqual(ethPrice1), 'test setup: the reference pool swap must move ethPriceUSD')

    modifyLiquidity(TOKENIZED_POOL_ID)

    assert.fieldEquals('Token', TUSDC_ADDRESS, 'derivedETH', safeDiv(ONE_BD, ethPrice2).toString())
    const priceUSD = Token.load(TUSDC_ADDRESS)!.derivedETH.times(ethPrice2)
    assert.assertTrue(
      priceUSD.gt(BigDecimal.fromString('0.999')) && priceUSD.lt(BigDecimal.fromString('1.001')),
      'tUSDC must stay ~$1, got ' + priceUSD.toString(),
    )
  })

  test('a reference pool swap refreshes every stablecoin Token, not only the two in that pool (the observed $2.09 USDC bug)', () => {
    initializeReferencePool()
    const ethPrice1 = Bundle.load('1')!.ethPriceUSD
    // Aave USDC was last priced when ETH was at ethPrice1 and no pool holding it is ever touched again
    createUnderlyingUsdc(safeDiv(ONE_BD, ethPrice1))
    const underlying = Token.load(AAVE_USDC_ADDRESS)!
    underlying.totalValueLocked = BigDecimal.fromString('240231')
    underlying.save()

    swap(REFERENCE_POOL_ID, REFERENCE_POOL_SQRT_PRICE_X96_MOVED, 199550)

    const ethPrice2 = Bundle.load('1')!.ethPriceUSD
    assert.assertTrue(ethPrice2.notEqual(ethPrice1), 'test setup: the reference pool swap must move ethPriceUSD')
    const expected = safeDiv(ONE_BD, ethPrice2)
    assert.fieldEquals('Token', AAVE_USDC_ADDRESS, 'derivedETH', expected.toString())
    // Circle USDC sits in the reference pool itself and is priced by the regular path
    assert.fieldEquals('Token', USDC_ADDRESS, 'derivedETH', expected.toString())
    assert.fieldEquals(
      'Token',
      AAVE_USDC_ADDRESS,
      'totalValueLockedUSD',
      BigDecimal.fromString('240231').times(expected).times(ethPrice2).toString(),
    )
    // a stablecoin without a Token entity yet is simply skipped
    assert.notInStore('Token', AAVE_USDT_ADDRESS)
  })

  test('tUSDC is priced as a stablecoin even before a Token entity exists for its underlying', () => {
    // Aave USDC only gets a Token entity once a pool containing it is initialised or the bank emits
    // SetConfigBorrowToken for it. tUSDC must not stay at 0 until then.
    initializeReferencePool()
    initializePool(TOKENIZED_POOL_ID, TUSDC_ADDRESS, TWETH_ADDRESS, Q96, 0)

    modifyLiquidity(TOKENIZED_POOL_ID)
    swap(TOKENIZED_POOL_ID, Q96, 0)

    assert.notInStore('Token', AAVE_USDC_ADDRESS)
    assert.fieldEquals('Token', TUSDC_ADDRESS, 'derivedETH', safeDiv(ONE_BD, Bundle.load('1')!.ethPriceUSD).toString())
    assert.fieldEquals('Token', TWETH_ADDRESS, 'derivedETH', '1')
  })
})

describe('allowlist is off on arbitrum-one (real config)', () => {
  beforeEach(() => {
    dataSourceMock.setNetwork(ARBITRUM_ONE_NETWORK)
    mockErc20(UNKNOWN_TOKEN_A, 'AAA', 18)
    mockErc20(UNKNOWN_TOKEN_B, 'BBB', 18)
  })

  afterEach(() => {
    clearStore()
    dataSourceMock.resetValues()
  })

  test('a pool between two unknown tokens is still indexed', () => {
    initializePool(UNKNOWN_POOL_ID, UNKNOWN_TOKEN_A, UNKNOWN_TOKEN_B, Q96, 0)

    assert.fieldEquals('Pool', UNKNOWN_POOL_ID, 'token0', UNKNOWN_TOKEN_A)
    assert.fieldEquals('Token', UNKNOWN_TOKEN_A, 'symbol', 'AAA')
    assert.fieldEquals('PoolManager', '0x360e68faccca8ca495c1b759fd9eee466db9fb32', 'poolCount', '1')
  })
})
