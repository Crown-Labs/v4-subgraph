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

import { handleSetConfigCollateralHelper } from '../../src/mappings/bank'
import { handleModifyLiquidityHelper } from '../../src/mappings/modifyLiquidity'
import { handleInitializeHelper } from '../../src/mappings/poolManager'
import { handleSwapHelper } from '../../src/mappings/swap'
import { SetConfigCollateral } from '../../src/types/KittycornBank/KittycornBank'
import { Initialize, ModifyLiquidity, Swap } from '../../src/types/PoolManager/PoolManager'
import { Bundle, PoolAllowCollateral, Token } from '../../src/types/schema'
import { ADDRESS_ZERO, ONE_BD } from '../../src/utils/constants'
import { safeDiv } from '../../src/utils/index'
import { createAndStoreTestToken, MOCK_EVENT } from '../handlers/constants'

// Handler-level behaviour of the pool allowlist and the tokenize derivedETH refresh, run against the
// real base-sepolia (and, for one test, arbitrum-one) config from src/utils/chains.ts.
const BASE_SEPOLIA_NETWORK = 'base-sepolia'
const ARBITRUM_ONE_NETWORK = 'arbitrum-one'

const BASE_SEPOLIA_POOL_MANAGER = '0x05e73354cfdd6745c338b50bcfdfa3aa6fa03408'
const BASE_SEPOLIA_KITTYCORN_PM = '0x8a2d75baadcd2c71b2acf715fc3da68964cea48e'

const USDC_ADDRESS = '0x036cbd53842c5426634e7929541ec2318f3dcf7e'
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006'
const TWETH_ADDRESS = '0xd09edda7a0495eac6b921fb9408d2ae55220ebc0'
const TUSDC_ADDRESS = '0x0b4104691a6a006f0134d507aae6d35854bad924'
const AAVE_USDC_ADDRESS = '0xba50cd2a20f6da35d788639e581bca8d0b5d4d5f' // underlying of tUSDC

const REFERENCE_POOL_ID = '0x025d03111ace126acfa746647812b6e921f950821df269826b73ccffebec9814'
const REFERENCE_POOL_SQRT_PRICE_X96 = '1825068347415163811313605517900399' // ~1884.52 USDC per ETH
const REFERENCE_POOL_TICK = 200905
// a second reference-pool price so the Bundle moves between two events (~1593 USDC per ETH)
const REFERENCE_POOL_SQRT_PRICE_X96_MOVED = '1985000000000000000000000000000000'

const TOKENIZED_POOL_ID = '0x00000000000000000000000000000000000000000000000000000000000000aa'
const UNKNOWN_POOL_ID = '0x00000000000000000000000000000000000000000000000000000000000000bb'
const NATIVE_USDC_POOL_ID = '0x00000000000000000000000000000000000000000000000000000000000000cc'
const UNKNOWN_TOKEN_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const UNKNOWN_TOKEN_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const Q96 = '79228162514264337593543950336' // sqrtPriceX96 for price 1, tick 0
const SOME_SENDER = '0x1111111111111111111111111111111111111111'

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

function initializePool(poolId: string, currency0: string, currency1: string, sqrtPriceX96: string, tick: i32): void {
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
      new ethereum.EventParam('fee', ethereum.Value.fromI32(3000)),
      new ethereum.EventParam('tickSpacing', ethereum.Value.fromI32(60)),
      new ethereum.EventParam('hooks', ethereum.Value.fromAddress(Address.fromString(ADDRESS_ZERO))),
      new ethereum.EventParam('sqrtPriceX96', ethereum.Value.fromUnsignedBigInt(BigInt.fromString(sqrtPriceX96))),
      new ethereum.EventParam('tick', ethereum.Value.fromI32(tick)),
    ],
    MOCK_EVENT.receipt,
  )
  handleInitializeHelper(event)
}

function initializeReferencePool(): void {
  initializePool(REFERENCE_POOL_ID, USDC_ADDRESS, WETH_ADDRESS, REFERENCE_POOL_SQRT_PRICE_X96, REFERENCE_POOL_TICK)
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
      new ethereum.EventParam('sender', ethereum.Value.fromAddress(Address.fromString(SOME_SENDER))),
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

function swap(poolId: string, sqrtPriceX96: string, tick: i32): void {
  const event = new Swap(
    MOCK_EVENT.address,
    MOCK_EVENT.logIndex,
    MOCK_EVENT.transactionLogIndex,
    MOCK_EVENT.logType,
    MOCK_EVENT.block,
    MOCK_EVENT.transaction,
    [
      new ethereum.EventParam('id', ethereum.Value.fromFixedBytes(Bytes.fromHexString(poolId) as Bytes)),
      new ethereum.EventParam('sender', ethereum.Value.fromAddress(Address.fromString(SOME_SENDER))),
      new ethereum.EventParam('amount0', ethereum.Value.fromSignedBigInt(BigInt.fromString('-1000000'))),
      new ethereum.EventParam('amount1', ethereum.Value.fromSignedBigInt(BigInt.fromString('500000000000000'))),
      new ethereum.EventParam('sqrtPriceX96', ethereum.Value.fromUnsignedBigInt(BigInt.fromString(sqrtPriceX96))),
      new ethereum.EventParam('liquidity', ethereum.Value.fromUnsignedBigInt(BigInt.fromString('1000000000000'))),
      new ethereum.EventParam('tick', ethereum.Value.fromI32(tick)),
      new ethereum.EventParam('fee', ethereum.Value.fromI32(3000)),
    ],
    MOCK_EVENT.receipt,
  )
  handleSwapHelper(event)
}

function setConfigCollateral(poolId: string): void {
  const event = new SetConfigCollateral(
    MOCK_EVENT.address,
    MOCK_EVENT.logIndex,
    MOCK_EVENT.transactionLogIndex,
    MOCK_EVENT.logType,
    MOCK_EVENT.block,
    MOCK_EVENT.transaction,
    [
      new ethereum.EventParam('poolId', ethereum.Value.fromFixedBytes(Bytes.fromHexString(poolId) as Bytes)),
      new ethereum.EventParam('allowCollateral', ethereum.Value.fromBoolean(true)),
      new ethereum.EventParam('maxLTV', ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(7000))),
      new ethereum.EventParam('liquidationThreshold', ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(8000))),
      new ethereum.EventParam('liquidationFee', ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1500))),
    ],
    MOCK_EVENT.receipt,
  )
  handleSetConfigCollateralHelper(event)
}

// A Token entity for tUSDC's underlying, as handleConfigBorrowToken would create it (derivedETH 0, no pools).
function createUnderlyingUsdc(derivedETH: BigDecimal): void {
  const underlying = createAndStoreTestToken({
    address: AAVE_USDC_ADDRESS,
    symbol: 'USDC',
    name: 'USD Coin',
    totalSupply: '1000000',
    decimals: '6',
    balanceOf: '0',
  })
  underlying.derivedETH = derivedETH
  underlying.save()
}

describe('allowlist: handlers on skipped or unknown pools (base-sepolia config)', () => {
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
    mockErc20(USDC_ADDRESS, 'USDC', 6)
    mockErc20(WETH_ADDRESS, 'WETH', 18)
    mockErc20(TUSDC_ADDRESS, 'tUSDC', 6)
    mockErc20(TWETH_ADDRESS, 'tWETH', 18)
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
    assert.notInStore('Token', '0x0a215d8ba66387dca84b284d18c3b4ec3de6e54a')
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
