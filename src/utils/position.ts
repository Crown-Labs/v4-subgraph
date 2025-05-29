// import { Address, BigInt, Bytes, log } from '@graphprotocol/graph-ts'

// import { PositionManager } from '../types/KittycornBank/PositionManager'
// import { ERC20 } from '../types/PoolManager/ERC20'
// import { ERC20NameBytes } from '../types/PoolManager/ERC20NameBytes'
// import { ERC20SymbolBytes } from '../types/PoolManager/ERC20SymbolBytes'
// import { ADDRESS_ZERO, ZERO_BI } from './constants'
// import { isNullEthValue } from './index'
// import { NativeTokenDetails } from './nativeTokenDetails'
// import { getStaticDefinition, StaticTokenDefinition } from './staticTokenDefinition'

// export class PoolKeyAndPositionInfo {
//   currency0: string
//   currency1: string
//   fee: BigInt
//   tickSpacing: BigInt
//   hooks: Address
//   positionInfo: BigInt
// }

// export function fetchGetPoolAndPositionInfo(
//   positionManagerAddress: Address,
//   tokenId: BigInt,
// ): PoolKeyAndPositionInfo | null {
//   const contract = PositionManager.bind(positionManagerAddress)
//   const getPoolAndPositionInfoResult = contract.try_getPoolAndPositionInfo(tokenId)

// log.info('2 success2 tokenid {}========================================', [tokenId.toString()])

// log.info('getPoolAndPositionInfoResult.value.value0.currency0.toHexString(): {}', [
//   getPoolAndPositionInfoResult.value.value0.currency0.toHexString(),
// ])
// log.info('getPoolAndPositionInfoResult.value.value0.currency1.toHexString(): {}', [
//   getPoolAndPositionInfoResult.value.value0.currency1.toHexString(),
// ])
// log.info('getPoolAndPositionInfoResult.value.value0.fee: {}', [
//   getPoolAndPositionInfoResult.value.value0.fee.toString(),
// ])
// log.info('getPoolAndPositionInfoResult.value.value0.tickSpacing: {}', [
//   getPoolAndPositionInfoResult.value.value0.tickSpacing.toString(),
// ])
// log.info('getPoolAndPositionInfoResult.value.value1.toHexString(): {}', [
//   getPoolAndPositionInfoResult.value.value1.toHexString(),
// ])
//   if (!getPoolAndPositionInfoResult.reverted) {
//     return {
//       currency0: getPoolAndPositionInfoResult.value.value0.currency0.toHexString(),
//       currency1: getPoolAndPositionInfoResult.value.value0.currency1.toHexString(),
//       fee: BigInt.fromI32(getPoolAndPositionInfoResult.value.value0.fee),
//       tickSpacing: BigInt.fromI32(getPoolAndPositionInfoResult.value.value0.tickSpacing),
//       hooks: getPoolAndPositionInfoResult.value.value0.hooks,
//       positionInfo: getPoolAndPositionInfoResult.value.value1,
//     }
//   } else {
//     log.error('fetchGetPoolAndPositionInfo: getPoolAndPositionInfo reverted for tokenId {}', [tokenId.toString()])
//     return null
//   }
// }
