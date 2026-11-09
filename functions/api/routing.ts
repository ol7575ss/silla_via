import { diagnostic } from '../../server/portal'
import { destinations, origins } from '../../src/tripData'
import { routePairs } from '../../src/routing'
import type { RouteStep, RouteSummary } from '../../src/routing'

type Row = Record<string, unknown>
function row(value: unknown): Row {
  return typeof value === 'object' && value !== null ? value as Row : {}
}
function number(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}
function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null
}
function step(value: unknown, walk: boolean): RouteStep {
  const raw = row(value)
  const p = row(raw.properties)
  const path = row(raw.path).points
  const points: [number, number][] = []
  for (const pair of Array.isArray(path) ? path : []) {
    if (Array.isArray(pair) && pair.length === 2 && pair.every(Number.isFinite) &&
      Math.abs(pair[0]) <= 180 && Math.abs(pair[1]) <= 90) points.push([pair[0], pair[1]])
  }
  const stops = Array.isArray(p.stops) ? p.stops : []
  const vehicles = Array.isArray(p.vehicles) ? p.vehicles.map(v => text(row(v).name)).filter((n): n is string => n !== null) : []
  return { type: walk ? 'WALKING' : text(p.type), guidance: text(p.guidance), seconds: number(p.time),
    meters: number(p.distance), vehicles, board: text(row(stops[0]).name),
    alight: stops.length > 1 ? text(row(stops.at(-1)).name) : null, points }
}
function respond(body: unknown, status: number) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}
const fail = (error: string, status: number) => respond({ ok: false, error }, status)
const missing = new Set(['NO_RESULTS','ROUTE_RESULT_NOT_FOUND','STARTNODES_NULL','ENDNODES_NULL',
  'START_LINK_NOT_FOUND','END_LINK_NOT_FOUND','TOO_FAR_AWAY'])
export async function onRequestGet({ request, env }: { request: Request; env: { KAKAO_REST_API_KEY?: string } }) {
  const params = new URL(request.url).searchParams
  const from = params.get('from'), to = params.get('to'), mode = params.get('mode')
  if (!from || !to || !routePairs.some(([a,b]) => a === from && b === to) ||
    (mode !== 'WALK' && mode !== 'PUBLIC_TRANSIT')) return fail('apiFailed', 400)
  const places = [...destinations, ...origins]
  const a = places.find(p => p.id === from), b = places.find(p => p.id === to)
  if (a?.latitude == null || a.longitude == null || b?.latitude == null || b.longitude == null) return fail('missing', 422)
  if (!env.KAKAO_REST_API_KEY?.trim()) return fail('apiKey', 503)
  const walk = mode === 'WALK'
  const url = new URL('https://dapi.kakao.com/v2/routing/' + (walk ? 'walk' : 'publictraffic'))
  url.search = new URLSearchParams({ start_x: String(a.longitude), start_y: String(a.latitude),
    end_x: String(b.longitude), end_y: String(b.latitude), input_coord: 'WGS84', output_coord: 'WGS84',
    s_name: a.name, e_name: b.name }).toString()
  try {
    const res = await fetch(url, { headers: { Authorization: 'KakaoAK ' + env.KAKAO_REST_API_KEY.trim() },
      redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000) })
    const body = await res.json().catch(() => null) as Row | null
    diagnostic('Kakao', walk ? 'walk' : 'publictraffic', res.status, String(body?.status ?? body?.code ?? ''),
      Array.isArray(body?.routes) ? body.routes.length : body?.route ? 1 : null, !body, [401,403].includes(res.status))
    if (res.status === 429) return fail('routeQuota', 429)
    if ([401,403].includes(res.status)) return fail('apiAuth', 502)
    if (!body) return fail('apiFailed',502)
    if (body.code === -10) return fail('routeQuota', 429)
    if (missing.has(String(body.status))) return fail('routeEmpty', 404)
    if (!res.ok || body.status !== 'OK') return fail('apiFailed', 502)
    if (!walk && Array.isArray(body.routes) && !body.routes.length) return fail('routeEmpty', 404)
    const route = row(walk ? body.route : Array.isArray(body.routes) ? body.routes[0] : null)
    const props = row(route.properties)
    const seconds = number(props.totalTime), meters = number(props.totalDistance)
    if (seconds === null || meters === null) return fail('apiFailed', 502)
    const steps = walk && Array.isArray(route.legs) ? route.legs.flatMap(leg => {
      const list = row(leg).steps
      return Array.isArray(list) ? list : []
    }) : route.steps
    const link = text(walk ? props.landingUrl : row(body.properties).landingURL)
    const result: RouteSummary = { ok: true, mode, from, to, meters, seconds, transfers: number(props.transfers),
      steps: Array.isArray(steps) ? steps.map(s => step(s, walk)) : [], source: 'KakaoMap',
      fetchedAt: new Date().toISOString(), landingUrl: link?.startsWith('https://map.kakao.com/') ? link : null }
    return respond(result, 200)
  } catch { return fail('apiFailed', 502) }
}
