export interface TravelLeg {
  fromPlaceId: string
  toPlaceId: string
  mode: 'WALK' | 'BUS'
  durationMinutes: number
  distanceMeters?: number
  demoOnly: boolean
}

// Directional estimates for demonstrations. Missing pairs have no estimate.
export const demoTravelLegs: TravelLeg[] = [
  { fromPlaceId: 'hwangnidan-stay', toPlaceId: 'daereungwon', mode: 'WALK', durationMinutes: 12, demoOnly: true },
  { fromPlaceId: 'daereungwon', toPlaceId: 'cheomseongdae', mode: 'WALK', durationMinutes: 15, demoOnly: true },
]
