import { Claimed } from '../types/KittycornPointDistributor/KittycornPointDistributor'
import { Burn } from '../types/PointToken/PointToken'
import { PointClaim, PointBurn } from '../types/schema'
import { loadTransaction } from '../utils'
import { eventId } from '../utils/id'

export function handleClaimed(event: Claimed): void {
  // Load transaction
  const transaction = loadTransaction(event)

  // Create PointClaim entity
  const claimId = eventId(event.transaction.hash, event.logIndex)
  const claim = new PointClaim(claimId)
  claim.to = event.params.to
  claim.amount = event.params.amount.abs()
  claim.nonce = event.params.nonce
  claim.timestamp = event.block.timestamp
  claim.transaction = transaction.id

  claim.save()
}

export function handleBurn(event: Burn): void {
  // Load transaction
  const transaction = loadTransaction(event)

  // Create PointBurn entity
  const burnId = eventId(event.transaction.hash, event.logIndex)
  const burn = new PointBurn(burnId)
  burn.from = event.params.from
  burn.amount = event.params.amount.abs()
  burn.timestamp = event.block.timestamp
  burn.transaction = transaction.id

  burn.save()
}
