export interface TravelLeg {
  fromPlaceId: string
  toPlaceId: string
  mode: 'WALK' | 'BUS'
  durationMinutes: number
  distanceMeters?: number
  source: string
  demoOnly: boolean
}

// Each entry describes one direction. The performance uses its own demo venue.
function estimate(fromPlaceId: string, toPlaceId: string, durationMinutes: number, mode: TravelLeg['mode'] = 'WALK'): TravelLeg {
  return { fromPlaceId, toPlaceId, durationMinutes, mode, demoOnly: true, source: 'DEMO' }
}

const hotel = 'hwangnidan-stay'
const event = 'traditional-performance'
export const demoTravelLegs = [
  estimate(hotel, 'daereungwon', 12), estimate('daereungwon', hotel, 12),
  estimate(hotel, 'cheomseongdae', 20), estimate('cheomseongdae', hotel, 20),
  estimate('daereungwon', 'cheomseongdae', 15), estimate('cheomseongdae', 'daereungwon', 15),
  estimate('cheomseongdae', event, 5), estimate(event, 'cheomseongdae', 5),
  estimate(event, hotel, 22), estimate(hotel, event, 22),
  estimate('daereungwon', event, 16), estimate(event, 'daereungwon', 16),
  estimate('cheomseongdae', 'museum', 18), estimate('museum', 'cheomseongdae', 18),
  estimate(event, 'museum', 16), estimate('museum', event, 16),
  estimate('museum', hotel, 25, 'BUS'),
]

// Extra museum links available in the rain demonstration.
export const rainTravelLegs = [...demoTravelLegs,
  estimate('daereungwon', 'museum', 21, 'BUS'),
  estimate('museum', 'daereungwon', 22, 'BUS'),
]
