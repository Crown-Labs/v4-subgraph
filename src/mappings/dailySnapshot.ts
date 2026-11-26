import { ethereum } from '@graphprotocol/graph-ts'

import { getSubgraphConfig } from '../utils/chains'
import { updateKittycornDayData } from '../utils/intervalUpdates'

// Event handlers only write KittycornDayData on days with Kittycorn activity. This polling handler
// writes the row on quiet days too, so the TVL chart has one point per day.
export function handleKittycornDailySnapshot(block: ethereum.Block): void {
  updateKittycornDayData(block, getSubgraphConfig().kittycornPositionManagerAddress)
}
