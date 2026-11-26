import { ethereum } from '@graphprotocol/graph-ts'

import { KittycornDayData } from '../types/schema'
import { getSubgraphConfig } from '../utils/chains'
import { updateKittycornDayData } from '../utils/intervalUpdates'

// Every handler that changes the Kittycorn totals also updates that day's KittycornDayData, so this
// polling handler only fills the days without any Kittycorn event.
export function handleKittycornDailySnapshot(block: ethereum.Block): void {
  const dayId = block.timestamp.toI32() / 86400
  if (KittycornDayData.load(dayId.toString()) !== null) {
    return
  }
  updateKittycornDayData(block, getSubgraphConfig().kittycornPositionManagerAddress)
}
