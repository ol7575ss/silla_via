import type { Place, TripPreferences } from '../tripData'
import type { TravelLeg } from '../travelTimes'

interface EventSlot { id: string; startTime: string; endTime: string }
export interface Visit {
  order: number
  placeId: string
  arrival: number
  departure: number
  stay: number
  wait: number
  leg: TravelLeg
  isEvent: boolean
  hoursUnknown: boolean
}
export interface Journey {
  visits: Visit[]
  travel: number
  sightseeing: number
  finish: number
  returnLeg: TravelLeg | null
  returnTime: number | null
  demoOnly: boolean
}
type Problem = 'choosePlaces' | 'timeRange' | 'limit' | 'missingLeg' | 'noTime' | 'eventTime' | 'returnTimeError'
type Result = { ok: true; journey: Journey } | { ok: false; reason: Problem; gaps: [string, string][] }

function minutes(time: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return NaN
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export function optimizeRoute(trip: TripPreferences, places: Place[], event: EventSlot, legs: TravelLeg[], rain?: { returnPlaceId: string }): Result {
  const gaps = new Map<string, [string, string]>()
  const fail = (reason: Problem): Result => ({ ok: false, reason, gaps: reason === 'missingLeg' ? [...gaps.values()] : [] })
  const start = minutes(trip.startTime)
  const end = minutes(trip.endTime)
  const required = new Set(trip.destinationIds)
  if (!(start < end)) return fail('timeRange')
  if (!required.size && !rain) return fail('choosePlaces')
  if (required.size > 5) return fail('limit')
  const attending = trip.eventId === event.id
  const eventStart = minutes(event.startTime)
  const eventEnd = minutes(event.endTime)
  if (attending && (start > eventStart || end < eventEnd)) return fail('eventTime')

  const links = new Map<string, TravelLeg>()
  const key = (from: string, to: string) => from + '/' + to
  for (const leg of legs) {
    if (!Number.isInteger(leg.durationMinutes) || leg.durationMinutes <= 0) continue
    const id = key(leg.fromPlaceId, leg.toPlaceId)
    if (leg.durationMinutes < (links.get(id)?.durationMinutes ?? Infinity)) links.set(id, leg)
  }
  const score = (p: Place) => {
    const matches = p.themes.filter(theme => trip.themes.includes(theme)).length
    if (!rain) return matches
    return p.setting === 'indoor' ? 10 + matches : matches - 6
  }
  const optional = places.filter(p => !required.has(p.id) && (score(p) > 0 || (rain && p.themes.some(t => trip.themes.includes(t)))) &&
    legs.some(l => l.toPlaceId === p.id)).sort((a, b) => score(b) - score(a))
  const candidates = [...required, ...optional.slice(0, 5 - required.size).map(p => p.id)]
  if (attending) candidates.push(event.id)
  const byId = new Map(places.map(p => [p.id, p]))
  let best: Journey | undefined
  let bestScore = -Infinity
  let earliestIndoor = Infinity
  let reachedStops = false
  let timedOut = false
  let missedEvent = false
  let lateReturn = false

  // Evaluate complete orders so a missing optional leg never invalidates a shorter itinerary.
  function evaluate(order: string[]) {
    let from = trip.originId
    let clock = start
    let travel = 0
    let sightseeing = 0
    let affinity = 0
    const visits: Visit[] = []
    // Check connectivity first: a time failure on an incomplete path is not evidence
    // that the required visits could be connected with more time.
    let connected = true
    for (const [index, id] of order.entries()) {
      const previous = index === 0 ? trip.originId : order[index - 1]
      if (!links.has(key(previous, id))) {
        gaps.set(key(previous, id), [previous, id])
        connected = false
      }
    }
    if (!connected) return
    for (const id of order) {
      const leg = links.get(key(from, id))!
      const arrival = clock + leg.durationMinutes
      const isEvent = attending && id === event.id
      const place = byId.get(id)
      if (!isEvent && !place) return
      const hours = place?.openingHours
      const begins = isEvent ? eventStart : Math.max(arrival, hours ? minutes(hours.open) : arrival)
      const stay = isEvent ? eventEnd - eventStart : place!.estimatedStayMinutes
      clock = begins + stay
      if (isEvent && arrival > eventStart) { missedEvent = true; return }
      if (clock > end || (hours && clock > minutes(hours.close))) { timedOut = true; return }
      travel += leg.durationMinutes
      sightseeing += stay
      if (place) affinity += score(place)
      visits.push({ order: visits.length + 1, placeId: id, arrival, departure: clock, stay,
        wait: begins - arrival, leg, isEvent, hoursUnknown: !isEvent && !hours })
      from = id
    }
    reachedStops = true
    let returnLeg: TravelLeg | null = null
    if ((trip.returnToOrigin || trip.finalPlaceId) && from !== (trip.finalPlaceId ?? rain?.returnPlaceId ?? trip.originId)) {
      const home = trip.finalPlaceId ?? rain?.returnPlaceId ?? trip.originId
      returnLeg = links.get(key(from, home)) ?? null
      if (!returnLeg) { gaps.set(key(from, home), [from, home]); return }
      clock += returnLeg.durationMinutes
      travel += returnLeg.durationMinutes
      if (clock > end) { lateReturn = true; return }
    }
    const indoorArrival = rain ? visits.find(v => byId.get(v.placeId)?.setting === 'indoor')?.arrival ?? Infinity : Infinity
    if (affinity === bestScore && indoorArrival > earliestIndoor) return
    if (affinity < bestScore || (affinity === bestScore && indoorArrival === earliestIndoor && best &&
      (travel > best.travel || (travel === best.travel && clock >= best.finish)))) return
    earliestIndoor = indoorArrival
    bestScore = affinity
    best = { visits, travel, sightseeing, finish: clock, returnLeg, returnTime: returnLeg ? clock : null,
      demoOnly: visits.some(v => v.leg.demoOnly) || !!returnLeg?.demoOnly }
  }

  function search(order: string[]) {
    if ([...required].every(id => order.includes(id)) && (!attending || order.includes(event.id))) evaluate(order)
    for (const id of candidates) if (!order.includes(id)) search([...order, id])
  }
  search([])
  if (best) return { ok: true, journey: best }
  if (lateReturn) return fail('returnTimeError')
  if (reachedStops) return fail('missingLeg')
  if (timedOut) return fail('noTime')
  if (missedEvent) return fail('eventTime')
  return fail('missingLeg')
}



