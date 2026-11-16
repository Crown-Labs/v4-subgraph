import { Address, BigDecimal, BigInt, Bytes, ethereum } from '@graphprotocol/graph-ts'
import { assert, createMockedFunction } from 'matchstick-as'

import { handleSetConfigCollateralHelper } from '../../src/mappings/bank'
import { handleModifyLiquidityHelper } from '../../src/mappings/modifyLiquidity'
import { handleInitializeHelper } from '../../src/mappings/poolManager'
import { handleSwapHelper } from '../../src/mappings/swap'
import { SetConfigCollateral } from '../../src/types/KittycornBank/KittycornBank'
import { Initialize, ModifyLiquidity, Swap } from '../../src/types/PoolManager/PoolManager'
import { ADDRESS_ZERO } from '../../src/utils/constants'
import { createAndStoreTestToken, MOCK_EVENT } from '../handlers/constants'

// Shared fixtures for handler-level tests that run against the real base-sepolia config in src/utils/chains.ts.
export const BASE_SEPOLIA_NETWORK = 'base-sepolia'
export const ARBITRUM_ONE_NETWORK = 'arbitrum-one'

export const BASE_SEPOLIA_POOL_MANAGER = '0x05e73354cfdd6745c338b50bcfdfa3aa6fa03408'
export const BASE_SEPOLIA_KITTYCORN_PM = '0x8a2d75baadcd2c71b2acf715fc3da68964cea48e'

export const USDC_ADDRESS = '0x036cbd53842c5426634e7929541ec2318f3dcf7e'
export const WETH_ADDRESS = '0x4200000000000000000000000000000000000006'
export const TWETH_ADDRESS = '0xd09edda7a0495eac6b921fb9408d2ae55220ebc0'
export const TUSDC_ADDRESS = '0x0b4104691a6a006f0134d507aae6d35854bad924'
export const AAVE_USDC_ADDRESS = '0xba50cd2a20f6da35d788639e581bca8d0b5d4d5f' // underlying of tUSDC
export const AAVE_USDT_ADDRESS = '0x0a215d8ba66387dca84b284d18c3b4ec3de6e54a' // underlying of tUSDT

export const REFERENCE_POOL_ID = '0x025d03111ace126acfa746647812b6e921f950821df269826b73ccffebec9814'
export const REFERENCE_POOL_SQRT_PRICE_X96 = '1825068347415163811313605517900399' // ~1884.52 USDC per ETH
export const REFERENCE_POOL_TICK = 200905
// a second reference-pool price so the Bundle moves between two events (~1593 USDC per ETH)
export const REFERENCE_POOL_SQRT_PRICE_X96_MOVED = '1985000000000000000000000000000000'

export const TOKENIZED_POOL_ID = '0x00000000000000000000000000000000000000000000000000000000000000aa'
export const UNKNOWN_POOL_ID = '0x00000000000000000000000000000000000000000000000000000000000000bb'
export const NATIVE_USDC_POOL_ID = '0x00000000000000000000000000000000000000000000000000000000000000cc'
export const UNKNOWN_TOKEN_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
export const UNKNOWN_TOKEN_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
export const Q96 = '79228162514264337593543950336' // sqrtPriceX96 for price 1, tick 0
export const SOME_SENDER = '0x1111111111111111111111111111111111111111'

export function mockErc20(address: string, symbol: string, decimals: i32): void {
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

export function mockBaseSepoliaTokens(): void {
  mockErc20(USDC_ADDRESS, 'USDC', 6)
  mockErc20(WETH_ADDRESS, 'WETH', 18)
  mockErc20(TUSDC_ADDRESS, 'tUSDC', 6)
  mockErc20(TWETH_ADDRESS, 'tWETH', 18)
}

export function initializePool(
  poolId: string,
  currency0: string,
  currency1: string,
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

export function initializeReferencePool(): void {
  initializePool(REFERENCE_POOL_ID, USDC_ADDRESS, WETH_ADDRESS, REFERENCE_POOL_SQRT_PRICE_X96, REFERENCE_POOL_TICK)
}

/** ModifyLiquidity of +1e12 liquidity on ticks [-600, 600] by `sender` (defaults to an address that is not the Kittycorn PM). */
export function modifyLiquidity(poolId: string, sender: string = SOME_SENDER): void {
  const event = new ModifyLiquidity(
    MOCK_EVENT.address,
    MOCK_EVENT.logIndex,
    MOCK_EVENT.transactionLogIndex,
    MOCK_EVENT.logType,
    MOCK_EVENT.block,
    MOCK_EVENT.transaction,
    [
      new ethereum.EventParam('id', ethereum.Value.fromFixedBytes(Bytes.fromHexString(poolId) as Bytes)),
      new ethereum.EventParam('sender', ethereum.Value.fromAddress(Address.fromString(sender))),
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

/** Swap that moves the pool to `sqrtPriceX96` / `tick`: 1 unit of token0 (6 decimals) in, 0.0005 of token1 (18 decimals) out. */
export function swap(poolId: string, sqrtPriceX96: string, tick: i32): void {
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

export function setConfigCollateral(poolId: string): void {
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
export function createUnderlyingUsdc(derivedETH: BigDecimal): void {
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

export function dayId(): string {
  return (MOCK_EVENT.block.timestamp.toI32() / 86400).toString()
}

export function hourId(): string {
  return (MOCK_EVENT.block.timestamp.toI32() / 3600).toString()
}

/** BigDecimal equality up to arbitrary-precision rounding noise (|a - b| < 1e-18). */
export function assertClose(actual: BigDecimal, expected: BigDecimal, message: string): void {
  let diff = actual.minus(expected)
  if (diff.lt(BigDecimal.zero())) {
    diff = diff.neg()
  }
  assert.assertTrue(
    diff.lt(BigDecimal.fromString('0.000000000000000001')),
    message + ': expected ' + expected.toString() + ', got ' + actual.toString(),
  )
}
