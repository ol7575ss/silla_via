import { destinations, performance } from '../tripData'
import type { TripPreferences } from '../tripData'
import { rainTravelLegs } from '../travelTimes'
import { optimizeRoute } from './optimizeRoute'
import type { Journey } from './optimizeRoute'

export function clock(minutes: number) {
  return [Math.floor(minutes / 60), minutes % 60].map(n => String(n).padStart(2, '0')).join(':')
}

export function rainCheckpoint(route: Journey, trip: TripPreferences) {
  const first = route.visits[0]
  const completed = first && first.departure < route.finish ? [first] : []
  const [h, m] = trip.startTime.split(':').map(Number)
  return {
    completed,
    currentTime: completed[0]?.departure ?? h * 60 + m,
    currentPlaceId: completed[0]?.placeId ?? trip.originId,
  }
}

export function replanRemainingRoute(original: Journey, trip: TripPreferences, selectedEventId: string | null, waived: string[] = []) {
  const { completed, currentTime, currentPlaceId } = rainCheckpoint(original, trip)
  const done = new Set(completed.map(v => v.placeId))
  const result = optimizeRoute({
    ...trip, originId: currentPlaceId, startTime: clock(currentTime),
    destinationIds: trip.destinationIds.filter(id => !done.has(id) && !waived.includes(id)),
    eventId: selectedEventId && !done.has(selectedEventId) ? selectedEventId : null,
  }, destinations.filter(p => !done.has(p.id) && !waived.includes(p.id)), performance, rainTravelLegs, { returnPlaceId: trip.originId })
  if (!result.ok) return result
  const tail = result.journey
  const journey: Journey = {
    ...tail,
    visits: [...completed, ...tail.visits.map(v => ({ ...v, order: v.order + completed.length }))],
    travel: tail.travel + completed.reduce((n, v) => n + v.leg.durationMinutes, 0),
    sightseeing: tail.sightseeing + completed.reduce((n, v) => n + v.stay, 0),
    demoOnly: tail.demoOnly || completed.some(v => v.leg.demoOnly),
  }
  return { ok: true as const, journey }
}
