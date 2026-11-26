import { Address, BigInt, ethereum } from '@graphprotocol/graph-ts'
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

import { handleLiquidatePositionHelper } from '../../src/mappings/bank'
import { LiquidatePosition as LiquidatePositionEvent } from '../../src/types/KittycornBank/KittycornBank'
import { LiquidityPosition, Position } from '../../src/types/schema'
import {
  createAndStoreTestPool,
  createAndStoreTestToken,
  MOCK_EVENT,
  TEST_CONFIG,
  TEST_NETWORK,
  USDC_MAINNET_FIXTURE,
  USDC_WETH_05_MAINNET_POOL_FIXTURE,
  USDC_WETH_POOL_ID,
  WETH_MAINNET_FIXTURE,
} from './constants'

const TOKEN_ID = 7
const POSITION_ID = 3
const OWNER = '0xa11ce00000000000000000000000000000000001'

function liquidateEvent(surplusAmount: string): LiquidatePositionEvent {
  return new LiquidatePositionEvent(
    MOCK_EVENT.address,
    MOCK_EVENT.logIndex,
    MOCK_EVENT.transactionLogIndex,
    MOCK_EVENT.logType,
    MOCK_EVENT.block,
    MOCK_EVENT.transaction,
    [
      new ethereum.EventParam('positionId', ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(POSITION_ID))),
      new ethereum.EventParam('tokenId', ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(TOKEN_ID))),
      new ethereum.EventParam('owner', ethereum.Value.fromAddress(Address.fromString(OWNER))),
      new ethereum.EventParam(
        'repayToken',
        ethereum.Value.fromAddress(Address.fromString(USDC_MAINNET_FIXTURE.address)),
      ),
      new ethereum.EventParam('liquidatePrice', ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1000000))),
      new ethereum.EventParam('positionValue', ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1000))),
      new ethereum.EventParam('liquidateRepayAmount', ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(900))),
      new ethereum.EventParam('liquidateFeeValue', ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(5))),
      new ethereum.EventParam('surplusAmount', ethereum.Value.fromUnsignedBigInt(BigInt.fromString(surplusAmount))),
    ],
    MOCK_EVENT.receipt,
  )
}

describe('handleLiquidatePosition', () => {
  beforeEach(() => {
    dataSourceMock.setNetwork(TEST_NETWORK)
    createAndStoreTestToken(USDC_MAINNET_FIXTURE)
    createAndStoreTestToken(WETH_MAINNET_FIXTURE)
    createAndStoreTestPool(USDC_WETH_05_MAINNET_POOL_FIXTURE)
    createMockedFunction(Address.fromString(USDC_MAINNET_FIXTURE.address), 'decimals', 'decimals():(uint32)').returns([
      ethereum.Value.fromI32(6),
    ])

    const position = new Position(TOKEN_ID.toString())
    position.tokenId = BigInt.fromI32(TOKEN_ID)
    position.owner = OWNER
    position.origin = OWNER
    position.createdAtTimestamp = BigInt.fromI32(0)
    position.isLiquidated = false
    position.liquidatedOwner = ''
    position.isCollateral = true
    position.isMigrated = false
    position.save()

    const liquidityPosition = new LiquidityPosition(TOKEN_ID.toString())
    liquidityPosition.tokenId = BigInt.fromI32(TOKEN_ID)
    liquidityPosition.position = position.id
    liquidityPosition.pool = USDC_WETH_POOL_ID
    liquidityPosition.tickLower = BigInt.fromI32(-600)
    liquidityPosition.tickUpper = BigInt.fromI32(600)
    liquidityPosition.liquidity = BigInt.fromI32(1)
    liquidityPosition.borrowAmount = BigInt.fromI32(0)
    liquidityPosition.save()
  })

  afterEach(() => {
    clearStore()
    dataSourceMock.resetValues()
  })

  test('stores the last event param as surplusAmount (owner refund), summed per day', () => {
    handleLiquidatePositionHelper(liquidateEvent('95'), TEST_CONFIG)

    const id = TOKEN_ID.toString() + '-' + POSITION_ID.toString()
    assert.fieldEquals('LiquidatePosition', id, 'surplusAmount', '95')
    assert.fieldEquals('LiquidatePosition', id, 'liquidateFeeValue', '5')
    assert.fieldEquals('LiquidatePosition', id, 'owner', OWNER)
    assert.fieldEquals('Position', TOKEN_ID.toString(), 'isLiquidated', 'true')

    const dayStart = (MOCK_EVENT.block.timestamp.toI32() / 86400) * 86400
    assert.fieldEquals('LiquidatePositionDaily', dayStart.toString(), 'surplusAmountAccumulate', '95')
    assert.fieldEquals('LiquidatePositionDaily', dayStart.toString(), 'totalCount', '1')
  })
})
