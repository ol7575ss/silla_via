import type { BusItem, BusPage } from '../../src/liveData'

const services = {
  stops: 'BusSttnInfoInqireService',
  routes: 'BusSttnInfoInqireService',
  detail: 'BusRouteInfoInqireService',
  arrivals: 'ArvlInfoInqireService',
}
const operations = { stops: 'getSttnNoList', routes: 'getSttnThrghRouteList', detail: 'getRouteInfoIem', arrivals: 'getSttnAcctoArvlPrearngeInfoList' }
type Action = keyof typeof services
type Row = Record<string, unknown>
type Context = { env: { BUS_API_KEY?: string }; request: Request; waitUntil(p: Promise<unknown>): void }
class TagoError extends Error {
  status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}
const field = (v: unknown) => typeof v === 'string' || typeof v === 'number' ? String(v).trim() : ''

async function query(ctx: Context, service: string, operation: string, params: Record<string, string>, ttl: number) {
  const url = new URL('https://apis.data.go.kr/1613000/' + service + '/' + operation)
  url.search = new URLSearchParams({ ...params, _type: 'json' }).toString()
  const key = new Request(new URL('/api/bus/cache/' + service + '/' + operation + url.search, ctx.request.url))
  const cache = (caches as CacheStorage & { default: Cache }).default
  const cached = await cache.match(key)
  type Page = { rows: Row[]; total: number; fetchedAt: string }
  if (cached) return await cached.json() as Page
  url.searchParams.set('serviceKey', decodeURIComponent(ctx.env.BUS_API_KEY!.trim()))
  const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10000) })
  const raw = await res.text()
  if (res.status === 429 || /LIMITED_NUMBER_OF_SERVICE_REQUESTS/.test(raw)) throw new TagoError('apiLimit', 429)
  if ([401,403].includes(res.status) || /SERVICE_KEY|ACCESS_DENIED|UNREGISTERED_IP/.test(raw)) throw new TagoError('apiAuth', 502)
  if (!res.ok) throw new TagoError('apiFailed', 502)
  const response = JSON.parse(raw).response
  const code = String(response?.header?.resultCode)
  if (code === '22') throw new TagoError('apiLimit', 429)
  if (['20','30','31','32','33'].includes(code)) throw new TagoError('apiAuth', 502)
  if (['10','11'].includes(code)) throw new TagoError('busInvalid', 400)
  if (code !== '00' && code !== '03') throw new TagoError('apiFailed', 502)
  const item = response.body?.items?.item
  const rows = Array.isArray(item) ? item : item && typeof item === 'object' ? [item] : []
  if (code === '00' && !rows.length && Number(response.body?.totalCount) !== 0) throw new TagoError('apiFailed', 502)
  const data: Page = { rows, total: Number(response.body?.totalCount ?? rows.length), fetchedAt: new Date().toISOString() }
  ctx.waitUntil(cache.put(key, Response.json(data, { headers: { 'Cache-Control': 'public, max-age=' + ttl } })).catch(() => undefined))
  return data
}

export async function onRequestGet(ctx: Context) {
  const params = new URL(ctx.request.url).searchParams
  const action = params.get('action') ?? 'cities'
  const value = params.get('q')?.trim() ?? ''
  const id = params.get('id') ?? ''
  const page = Number(params.get('page') ?? 1)
  const fail = (error: string, status: number) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } })
  if (!(action === 'cities' || Object.hasOwn(services, action)) || !Number.isInteger(page) || page < 1 || page > 1000 ||
    (action === 'stops' && (!value || value.length > 30)) ||
    (['routes','detail','arrivals'].includes(action) && !/^[\w-]{1,30}$/.test(id))) return fail('busInvalid', 400)
  if (!ctx.env.BUS_API_KEY?.trim()) return fail('apiKey', 503)
  const service = action === 'cities' ? services.stops : services[action as Action]
  try {
    const cities = await query(ctx, service, 'getCtyCodeList', {}, 86400)
    const cityList = cities.rows.map(r => ({ id: field(r.citycode), name: field(r.cityname) }))
    if (action === 'cities') return Response.json({ items: cityList, fetchedAt: cities.fetchedAt, more: false })
    const city = cityList.find(c => /(?:^|\s)경주시?$/.test(c.name) && /^\d+$/.test(c.id))
    if (!city) return fail('busRegion', 404)
    const args: Record<string,string> = { cityCode: city.id, numOfRows: '50', pageNo: String(page) }
    if (action === 'stops') args.nodeNm = value
    if (action === 'routes') args.nodeid = id
    if (action === 'arrivals') args.nodeId = id
    if (action === 'detail') args.routeId = id
    const ttl = action === 'arrivals' ? 20 : 1800
    const data = await query(ctx, service, operations[action as Action], args, ttl)
    const items: BusItem[] = []
    for (const r of data.rows) {
      if (action === 'stops') {
        if (field(r.nodeid) && field(r.nodenm)) items.push({ id: field(r.nodeid), name: field(r.nodenm) })
      } else if (field(r.routeid) && field(r.routeno)) {
        const entry: BusItem = { id: field(r.routeid), name: field(r.routeno), start: field(r.startnodenm), end: field(r.endnodenm) }
        if (action === 'arrivals') {
          if (!/^\d+$/.test(field(r.arrtime))) continue
          entry.seconds = Number(r.arrtime)
          entry.stop = field(r.nodenm)
        }
        items.push(entry)
      }
    }
    if (data.rows.length && !items.length) return fail('apiFailed', 502)
    const out: BusPage = { items, fetchedAt: data.fetchedAt, more: page * 50 < data.total }
    return Response.json(out, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) { return err instanceof TagoError ? fail(err.message, err.status) : fail('apiFailed', 502) }
}
