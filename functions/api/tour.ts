import { diagnostic, portalKey, portalPage, ProviderError } from '../../server/portal'
import type { TourKind, TourPage, TourPlace } from '../../src/tourData'

type Context = { request: Request; env: { TOUR_API_KEY?: string }; waitUntil(p: Promise<unknown>): void }
const types = { attractions: '12', culture: '14', festivals: '15', dining: '39', lodging: '32' }
const sourceUrl = 'https://www.data.go.kr/data/15101578/openapi.do'
const text = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
function coordinate(value: unknown, max: number) {
  const n = Number(value)
  return Number.isFinite(n) && n !== 0 && Math.abs(n) <= max ? n : null
}
function normalize(row: Record<string, unknown>, fetchedAt: string): TourPlace {
  const license = text(row.cpyrhtDivCd)
  const image = text(row.firstimage)
  return {
    source: 'TOUR_API', sourceUrl, externalContentId: text(row.contentid), contentType: text(row.contenttypeid),
    name: text(row.title), address: [text(row.addr1), text(row.addr2)].filter(Boolean).join(' '),
    latitude: coordinate(row.mapy, 90), longitude: coordinate(row.mapx, 180),
    imageUrl: ['Type1','Type3'].includes(license) && /^https?:\/\/[^/]+\.visitkorea\.or\.kr\//i.test(image)
      ? image.replace(/^http:/i, 'https:') : null,
    license, description: text(row.overview).replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]+>/g, ''),
    start: text(row.eventstartdate), end: text(row.eventenddate), lastFetchedAt: fetchedAt,
  }
}
function fail(error: string, status: number) {
  return Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } })
}
function logTourFailure(error: unknown, secret: string, url: URL, operation: string, stage: string, http: number | null) {
  let message = error instanceof Error ? error.message : 'Non-Error exception'
  // Discard URL queries and header contents before logging even a truncated message.
  message = message.replace(/\?\S*|(?:authorization|proxy-authorization)\s*[:=][^\r\n]*|serviceKey\s*=[^\s&]*/gi, '[redacted]')
  const variants = new Set([secret.trim()])
  try { variants.add(decodeURIComponent(secret.trim())) } catch { /* Malformed encoding may itself be the exception. */ }
  for (const key of variants) {
    if (key) message = message.replaceAll(key, '[redacted]').replaceAll(encodeURIComponent(key), '[redacted]')
  }
  const cause = error instanceof Error ? error.cause : null
  const code = cause && typeof cause === 'object' && 'code' in cause ? cause.code : null
  const name = error instanceof Error && /^[A-Za-z]{1,32}Error$/.test(error.name) ? error.name : 'Error'
  const causeCode = typeof code === 'string' && /^(?:E[A-Z]{2,20}|UND_ERR_[A-Z_]{1,32}|ERR_[A-Z_]{1,32})$/.test(code) ? code : null
  console.warn(JSON.stringify({ service: 'TourAPI', operation, stage, host: url.host, pathname: url.pathname,
    http, name, message: message.replace(/[\r\n]+/g,' ').slice(0,240), causeCode }))
}
export async function onRequestGet(ctx: Context) {
  const query = new URL(ctx.request.url).searchParams
  const kind = query.get('kind') as TourKind
  const page = Number(query.get('page') ?? 1)
  const id = query.get('id')
  const keyword = query.get('q')?.trim() ?? ''
  const intro = query.get('intro') === '1'
  if (keyword.length > 60 || (keyword && (kind === 'festivals' || id)) || (intro && !id)) return fail('apiFailed',400)
  if (!Object.hasOwn(types, kind) || !Number.isInteger(page) || page < 1 || page > 1000 ||
    (id !== null && !/^\d{1,12}$/.test(id))) return fail('apiFailed', 400)
  if (!ctx.env.TOUR_API_KEY?.trim()) return fail('apiKey', 503)
  const ttl = kind === 'festivals' ? 1800 : 86400
  const event = kind === 'festivals'
  const operation = intro ? 'detailIntro2' : id ? 'detailCommon2' : keyword ? 'searchKeyword2' : event ? 'searchFestival2' : 'areaBasedList2'
  const url = new URL('https://apis.data.go.kr/B551011/KorService2/' + operation)
  let stage = 'cache'
  let http: number | null = null
  try {
    const cacheKey = new Request(new URL('/api/tour-cache-v3?kind=' + kind + '&q=' + encodeURIComponent(keyword) + '&intro=' + Number(intro) + (id ? '&id=' + id : '&page=' + page), ctx.request.url))
    const cache = (caches as CacheStorage & { default: Cache }).default
    const cached = await cache.match(cacheKey).catch(() => undefined)
    if (cached) return cached
    stage = 'request'
    const size = event ? 100 : 12
    const params = new URLSearchParams({ serviceKey: portalKey(ctx.env.TOUR_API_KEY), MobileOS: 'WEB',
      MobileApp: 'SillaVia', _type: 'json', pageNo: String(page), numOfRows: String(size) })
    if (id) { params.set('contentId', id); if (intro) params.set('contentTypeId',types[kind]) }
    else {
      params.set('lDongRegnCd', '47')
      params.set('lDongSignguCd', '130')
      params.set('arrange', 'A')
      // Cache the city's dated festival pages across travel dates, including ongoing multi-year events.
      if (event) params.set('eventStartDate', '19000101')
      else if (keyword) params.set('keyword',keyword)
      else params.set('contentTypeId', types[kind])
    }
    url.search = params.toString()
    const upstream = new Request(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(12000) })
    stage = 'fetch'
    const res = await fetch(upstream)
    http = res.status
    stage = 'response'
    if (res.status >= 300 && res.status < 400) throw new Error('Unexpected upstream redirect')
    const { rows, total } = await portalPage(res, 'TourAPI', operation)
    const fetchedAt = new Date().toISOString()
    if (intro) {
      const detail = rows.find(r => text(r.contentid) === id && text(r.contenttypeid) === types[kind])
      const plain = (v: unknown) => text(v).replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]+>/g,'')
      const info = { hours: plain(detail?.usetime || detail?.usetimeculture || detail?.opentimefood || detail?.playtime),
        closed: plain(detail?.restdate || detail?.restdateculture || detail?.restdatefood),
        checkIn: plain(detail?.checkintime), checkOut: plain(detail?.checkouttime), fetchedAt }
      const out = Response.json(info,{ headers: { 'Cache-Control': 'public, max-age=' + ttl } })
      ctx.waitUntil(cache.put(cacheKey,out.clone()).catch(() => undefined))
      return out
    }
    const items: TourPlace[] = []
    for (const row of rows) {
      const province = text(row.lDongRegnCd ?? row.ldongregncd)
      const city = text(row.lDongSignguCd ?? row.ldongsigngucd)
      const addressMatches = /(?:^|\s)경주시(?:\s|$)/.test(text(row.addr1))
      // Lists are already scoped by the provider. Detail lookups require city evidence.
      if ((province && province !== '47') || (city && city !== '130') ||
        (id && !(province === '47' && city === '130') && !addressMatches)) continue
      if (text(row.contenttypeid) !== types[kind] || !text(row.title) || !text(row.contentid)) continue
      if (id && text(row.contentid) !== id) continue
      if (['취소','행사연기','연기'].includes(text(row.progresstype))) continue
      items.push(normalize(row, fetchedAt))
    }
    if (!keyword && rows.length && !items.length && !rows.every(r => ['취소','행사연기','연기'].includes(text(r.progresstype)))) {
      diagnostic('TourAPI', operation, res.status, 'FILTER_MISMATCH', 0)
      return fail('apiFailed', 502)
    }
    const result: TourPage = { items, more: !id && page * size < total, fetchedAt }
    const out = Response.json(result, { headers: { 'Cache-Control': 'public, max-age=' + ttl } })
    ctx.waitUntil(cache.put(cacheKey, out.clone()).catch(() => undefined))
    return out
  } catch (e) {
    logTourFailure(e, ctx.env.TOUR_API_KEY, url, operation, stage, http)
    return e instanceof ProviderError ? fail(e.key, e.status) : fail('apiFailed', 502)
  }
}
