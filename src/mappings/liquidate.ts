import { log } from 'matchstick-as'

import { LiquidatePosition as LiquidatePositionEvent } from '../types/KittycornBank/KittycornBank'
import { LiquidatePosition } from '../types/schema'
import { ZERO_BI } from '../utils/constants'

export function handleLiquidatePosition(event: LiquidatePositionEvent): void {
  const positionId = event.params.tokenId.toHexString() + '-' + event.params.positionId.toHexString()

  log.debug('mybug the event was called {}', [positionId])

  let position = LiquidatePosition.load(positionId)
  if (position === null) {
    position = new LiquidatePosition(positionId)
    position.positionId = ZERO_BI
    position.tokenId = ZERO_BI
  }
  position.save()
}
