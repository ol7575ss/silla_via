export const routePairs = [
  ['cheomseongdae', 'daereungwon'],
  ['daereungwon', 'museum'],
  ['station', 'bulguksa'],
] as const

export type RouteMode = 'WALK' | 'PUBLIC_TRANSIT'
export interface RouteStep {
  type: string | null
  guidance: string | null
  seconds: number | null
  meters: number | null
  vehicles: string[]
  board: string | null
  alight: string | null
  points: [number, number][]
}
export interface RouteSummary {
  ok: true
  from: string
  to: string
  mode: RouteMode
  seconds: number
  meters: number
  transfers: number | null
  steps: RouteStep[]
  source: 'KakaoMap'
  fetchedAt: string
  landingUrl: string | null
}
