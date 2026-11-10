import { diagnostic, portalEnvelope, portalKey, ProviderError } from '../../server/portal'
import type { BusItem, BusPage } from '../../src/liveData'

const operations = {
  stops: { path: 'getSttnNoList01', param: 'nodeNm', list: 'BSTOP-LIST', item: 'BSTOP', ttl: 86400 },
  routes: { path: 'getRouteNoList01', param: 'routeNo', list: 'LINE-LIST', item: 'LINE', ttl: 86400 },
  positions: { path: 'getRouteAcctoBusLcList01', param: 'routeId', list: 'BSTOP-LIST', item: 'BSTOP', ttl: 600 },
}
// Best effort per Worker isolate; the provider enforces the account-wide daily quota.
const activePositions = new Set<string>()
let budgetDay = ''
let positionReads = 0
let blockedUntil = 0
type Context = { request: Request; env: { BUS_API_KEY?: string }; waitUntil(p: Promise<unknown>): void }
export async function onRequestGet(ctx: Context) {
  const params = new URL(ctx.request.url).searchParams
  const action = params.get('action') as keyof typeof operations
  const q = params.get('q')?.trim() ?? ''
  const page = Number(params.get('page') ?? 1)
  const fail = (error: string, status: number) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } })
  if (!Object.hasOwn(operations,action) || !q || q.length > 40 || !Number.isInteger(page) || page < 1 || page > 100) return fail('busInvalid',400)
  if (!ctx.env.BUS_API_KEY?.trim()) return fail('apiKey',503)
  const op = operations[action]
  const args = new URLSearchParams({ [op.param]: q, pageNo: String(page), numOfRows: '50' })
  const cacheKey = new Request(new URL('/bus-city-cache/' + op.path + '?' + args, ctx.request.url))
  const cache = (caches as CacheStorage & { default: Cache }).default
  let locked=false
  const position=action==='positions'
  if(position && (!/^\d{1,20}$/.test(q) || page!==1)) return fail('busInvalid',400)
  try {
    const cached = await cache.match(cacheKey).catch(() => undefined)
    if (cached) return cached
    if(position) {
      const now=Date.now()
      const day=new Date(now+9*3600000).toISOString().slice(0,10)
      if(day!==budgetDay){budgetDay=day;positionReads=0}
      if(activePositions.has(q)) return fail('busBusy',409)
      if(positionReads>=95 || now<blockedUntil) return fail('apiLimit',429)
      activePositions.add(q);locked=true;positionReads++
    }
    args.set('serviceKey',portalKey(ctx.env.BUS_API_KEY))
    const res = await fetch('https://apis.data.go.kr/5050000/openapi01/' + op.path + '?' + args,
      { redirect: 'manual', signal: AbortSignal.timeout(12000) })
    const { payload, empty, code } = await portalEnvelope(res,'GyeongjuBus',op.path)
    const entries = payload?.body?.[op.list]?.[op.item]
    const rows = Array.isArray(entries) ? entries : entries && typeof entries === 'object' ? [entries] : []
    const total = empty ? 0 : Number(payload?.header?.totalCnt ?? NaN)
    if (!Number.isInteger(total) || total < 0 || (!rows.length && total > (page - 1)*50)) throw new ProviderError('apiFailed',502)
    const items: BusItem[] = rows.map(r => ({
      id: String((action === 'routes' ? r.routeId : r.nodeId) ?? ''),
      name: String((action === 'routes' ? r.routeNo : action === 'positions' ? r.routeNm : r.nodeNm) ?? ''),
      start: r.startNodeNm, end: r.endNodeNm, stop: action === 'positions' ? r.nodeNm : undefined,
      x: r.gpsLong, y: r.gpsLati, order: r.nodeOrd, type: r.routeTp ?? r.busTp,
    }))
    if (items.some(item => !item.name)) throw new ProviderError('apiFailed',502)
    diagnostic('GyeongjuBus',op.path,res.status,code,items.length)
    const out: BusPage = { items, fetchedAt: new Date().toISOString(), more: page * 50 < total }
    const response = Response.json(out,{ headers: { 'Cache-Control': 'public, max-age=' + op.ttl } })
    await cache.put(cacheKey,response.clone()).catch(() => undefined)
    return response
  } catch(e) {
    if(position && e instanceof ProviderError && e.key==='apiLimit') blockedUntil=Date.now()+600000
    if (!(e instanceof ProviderError)) diagnostic('GyeongjuBus',op.path,0,'REQUEST_FAILED',null)
    return e instanceof ProviderError ? fail(e.key,e.status) : fail('apiFailed',502)
  } finally { if(locked) activePositions.delete(q) }
}
