import { BigInt } from '@graphprotocol/graph-ts'
import { afterEach, assert, beforeEach, clearStore, dataSourceMock, describe, test } from 'matchstick-as'

import { KittycornDayData, KittycornPositionManager, Pool, PoolManager } from '../../src/types/schema'
import {
  assertClose,
  BASE_SEPOLIA_KITTYCORN_PM,
  BASE_SEPOLIA_NETWORK,
  BASE_SEPOLIA_POOL_MANAGER,
  dayId,
  hourId,
  initializePool,
  initializeReferencePool,
  mockBaseSepoliaTokens,
  modifyLiquidity,
  Q96,
  setConfigCollateral,
  swap,
  TOKENIZED_POOL_ID,
  TUSDC_ADDRESS,
  TWETH_ADDRESS,
} from './baseSepoliaFixtures'

// Accumulated values (day/hour rows, PoolManager and KittycornPositionManager aggregates) must agree with
// the entities they summarise after every handler, not one event later.

function kpm(): KittycornPositionManager {
  return KittycornPositionManager.load(BASE_SEPOLIA_KITTYCORN_PM)!
}

function pool(): Pool {
  return Pool.load(TOKENIZED_POOL_ID)!
}

describe('interval rows are written from the saved state of the same event', () => {
  beforeEach(() => {
    dataSourceMock.setNetwork(BASE_SEPOLIA_NETWORK)
    mockBaseSepoliaTokens()
    initializeReferencePool()
    initializePool(TOKENIZED_POOL_ID, TUSDC_ADDRESS, TWETH_ADDRESS, Q96, 0)
  })

  afterEach(() => {
    clearStore()
    dataSourceMock.resetValues()
  })

  test('PoolDayData / PoolHourData after handleModifyLiquidity carry the new liquidity and tvlUSD', () => {
    modifyLiquidity(TOKENIZED_POOL_ID)

    const p = pool()
    assert.assertTrue(p.liquidity.gt(BigInt.zero()), 'setup: liquidity added')
    const dayRow = TOKENIZED_POOL_ID + '-' + dayId()
    const hourRow = TOKENIZED_POOL_ID + '-' + hourId()
    assert.fieldEquals('PoolDayData', dayRow, 'liquidity', p.liquidity.toString())
    assert.fieldEquals('PoolDayData', dayRow, 'tvlUSD', p.totalValueLockedUSD.toString())
    assert.fieldEquals('PoolHourData', hourRow, 'liquidity', p.liquidity.toString())
    assert.fieldEquals('PoolHourData', hourRow, 'tvlUSD', p.totalValueLockedUSD.toString())
  })

  test('UniswapDayData after handleModifyLiquidity carries the new PoolManager txCount and tvlUSD', () => {
    modifyLiquidity(TOKENIZED_POOL_ID)

    const pm = PoolManager.load(BASE_SEPOLIA_POOL_MANAGER)!
    assert.fieldEquals('UniswapDayData', dayId(), 'txCount', pm.txCount.toString())
    assert.fieldEquals('UniswapDayData', dayId(), 'tvlUSD', pm.totalValueLockedUSD.toString())
  })

  test('PoolDayData and UniswapDayData after handleSwap carry the post-swap tvlUSD and txCount', () => {
    modifyLiquidity(TOKENIZED_POOL_ID)
    swap(TOKENIZED_POOL_ID, Q96, 0)

    const p = pool()
    const pm = PoolManager.load(BASE_SEPOLIA_POOL_MANAGER)!
    assert.fieldEquals('PoolDayData', TOKENIZED_POOL_ID + '-' + dayId(), 'tvlUSD', p.totalValueLockedUSD.toString())
    assert.fieldEquals('PoolHourData', TOKENIZED_POOL_ID + '-' + hourId(), 'tvlUSD', p.totalValueLockedUSD.toString())
    assert.fieldEquals('UniswapDayData', dayId(), 'txCount', pm.txCount.toString())
    assert.fieldEquals('UniswapDayData', dayId(), 'tvlUSD', pm.totalValueLockedUSD.toString())
  })

  test('KittycornDayData after a swap on a collateral pool carries the updated collateral and TVL', () => {
    setConfigCollateral(TOKENIZED_POOL_ID)
    modifyLiquidity(TOKENIZED_POOL_ID, BASE_SEPOLIA_KITTYCORN_PM)
    swap(TOKENIZED_POOL_ID, Q96, 0)

    const row = KittycornDayData.load(dayId())!
    assert.stringEquals(row.collateralUSD.toString(), kpm().totalCollateralUSD.toString())
    assert.stringEquals(row.tvlUSD.toString(), kpm().totalValueLockedUSD.toString())
    assert.stringEquals(row.txCount.toString(), kpm().txCount.toString())
  })
})

describe('Kittycorn TVL and collateral aggregates follow pool TVL through swaps', () => {
  beforeEach(() => {
    dataSourceMock.setNetwork(BASE_SEPOLIA_NETWORK)
    mockBaseSepoliaTokens()
    initializeReferencePool()
    initializePool(TOKENIZED_POOL_ID, TUSDC_ADDRESS, TWETH_ADDRESS, Q96, 0)
  })

  afterEach(() => {
    clearStore()
    dataSourceMock.resetValues()
  })

  test('totalCollateralETH equals the collateral pool TVL after liquidity, a swap, and more liquidity', () => {
    setConfigCollateral(TOKENIZED_POOL_ID)
    modifyLiquidity(TOKENIZED_POOL_ID)
    assertClose(kpm().totalCollateralETH, pool().totalValueLockedETH, 'after first liquidity')

    const before = pool().totalValueLockedETH
    swap(TOKENIZED_POOL_ID, Q96, 0)
    assert.assertTrue(pool().totalValueLockedETH.notEqual(before), 'setup: the swap must change the pool TVL')
    assertClose(kpm().totalCollateralETH, pool().totalValueLockedETH, 'after swap')

    modifyLiquidity(TOKENIZED_POOL_ID)
    assertClose(kpm().totalCollateralETH, pool().totalValueLockedETH, 'after second liquidity')
    assertClose(
      kpm().totalCollateralUSD,
      kpm().totalCollateralETH.times(pool().totalValueLockedUSD.div(pool().totalValueLockedETH)),
      'collateral USD follows ETH',
    )
  })

  test('totalValueLockedETH tracks a Kittycorn pool whoever changes its liquidity afterwards', () => {
    // non-Kittycorn liquidity before the pool is flagged: not counted
    modifyLiquidity(TOKENIZED_POOL_ID)
    assert.fieldEquals('KittycornPositionManager', BASE_SEPOLIA_KITTYCORN_PM, 'totalValueLockedETH', '0')
    assert.fieldEquals('Pool', TOKENIZED_POOL_ID, 'isKittycornLiquidity', 'false')

    // first Kittycorn PM event: the whole pool TVL is counted, nothing is subtracted for the earlier liquidity
    modifyLiquidity(TOKENIZED_POOL_ID, BASE_SEPOLIA_KITTYCORN_PM)
    assert.fieldEquals('Pool', TOKENIZED_POOL_ID, 'isKittycornLiquidity', 'true')
    assertClose(kpm().totalValueLockedETH, pool().totalValueLockedETH, 'after first Kittycorn liquidity')

    // a swap and then liquidity from someone else keep the aggregate on the pool TVL
    swap(TOKENIZED_POOL_ID, Q96, 0)
    assertClose(kpm().totalValueLockedETH, pool().totalValueLockedETH, 'after swap')
    modifyLiquidity(TOKENIZED_POOL_ID)
    assertClose(kpm().totalValueLockedETH, pool().totalValueLockedETH, 'after third-party liquidity')
  })

  test('a swap on a pool that is neither Kittycorn nor collateral leaves the Kittycorn aggregates alone', () => {
    modifyLiquidity(TOKENIZED_POOL_ID)
    swap(TOKENIZED_POOL_ID, Q96, 0)

    assert.fieldEquals('KittycornPositionManager', BASE_SEPOLIA_KITTYCORN_PM, 'totalValueLockedETH', '0')
    assert.fieldEquals('KittycornPositionManager', BASE_SEPOLIA_KITTYCORN_PM, 'totalCollateralETH', '0')
    assert.fieldEquals('KittycornPositionManager', BASE_SEPOLIA_KITTYCORN_PM, 'txCount', '0')
  })

  test('configuring collateral on a pool that already holds liquidity counts its current TVL at once', () => {
    modifyLiquidity(TOKENIZED_POOL_ID)
    assert.fieldEquals('KittycornPositionManager', BASE_SEPOLIA_KITTYCORN_PM, 'totalCollateralETH', '0')

    setConfigCollateral(TOKENIZED_POOL_ID)
    assertClose(kpm().totalCollateralETH, pool().totalValueLockedETH, 'right after SetConfigCollateral')
    assert.fieldEquals('KittycornPositionManager', BASE_SEPOLIA_KITTYCORN_PM, 'poolCount', '1')

    // a second SetConfigCollateral (parameter change) must not add the TVL again
    setConfigCollateral(TOKENIZED_POOL_ID)
    assertClose(kpm().totalCollateralETH, pool().totalValueLockedETH, 'after reconfiguring')
    assert.fieldEquals('KittycornPositionManager', BASE_SEPOLIA_KITTYCORN_PM, 'poolCount', '1')

    modifyLiquidity(TOKENIZED_POOL_ID)
    assertClose(kpm().totalCollateralETH, pool().totalValueLockedETH, 'after the next liquidity change')
  })
})
