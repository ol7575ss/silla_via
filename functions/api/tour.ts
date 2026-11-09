import type { TourKind, TourPage, TourPlace } from '../../src/tourData'

type Context = { request: Request; env: { TOUR_API_KEY?: string }; waitUntil(p: Promise<unknown>): void }
const types = { attractions: '12', culture: '14', festivals: '15' }
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
export async function onRequestGet(ctx: Context) {
  const query = new URL(ctx.request.url).searchParams
  const kind = query.get('kind') as TourKind
  const page = Number(query.get('page') ?? 1)
  const id = query.get('id')
  if (!Object.hasOwn(types, kind) || !Number.isInteger(page) || page < 1 || page > 1000 ||
    (id !== null && !/^\d{1,12}$/.test(id))) return fail('apiFailed', 400)
  if (!ctx.env.TOUR_API_KEY?.trim()) return fail('apiKey', 503)
  const ttl = kind === 'festivals' ? 1800 : 86400
  const cacheKey = new Request(new URL('/api/tour?kind=' + kind + (id ? '&id=' + id : '&page=' + page), ctx.request.url))
  const cache = (caches as CacheStorage & { default: Cache }).default
  try {
    const cached = await cache.match(cacheKey)
    if (cached) return cached
    const event = kind === 'festivals'
    const operation = id ? 'detailCommon2' : event ? 'searchFestival2' : 'areaBasedList2'
    const size = event ? 100 : 12
    const params = new URLSearchParams({ serviceKey: decodeURIComponent(ctx.env.TOUR_API_KEY.trim()), MobileOS: 'WEB',
      MobileApp: 'SillaVia', _type: 'json', pageNo: String(page), numOfRows: String(size) })
    if (id) params.set('contentId', id)
    else {
      params.set('lDongRegnCd', '47')
      params.set('lDongSignguCd', '130')
      params.set('arrange', 'A')
      // Cache the city's dated festival pages across travel dates, including ongoing multi-year events.
      if (event) params.set('eventStartDate', '19000101')
      else params.set('contentTypeId', types[kind])
    }
    const res = await fetch('https://apis.data.go.kr/B551011/KorService2/' + operation + '?' + params,
      { redirect: 'error', signal: AbortSignal.timeout(12000) })
    const raw = await res.text()
    if (res.status === 429 || /LIMITED_NUMBER|LIMITED_NUMBER_OF_SERVICE_REQUESTS/i.test(raw)) return fail('tourQuota', 429)
    if ([401,403].includes(res.status) || /SERVICE_KEY|ACCESS_DENIED/i.test(raw)) return fail('apiAuth', 502)
    if (!res.ok) return fail('apiFailed', 502)
    const response = JSON.parse(raw).response
    const code = String(response?.header?.resultCode)
    if (code === '22') return fail('tourQuota', 429)
    if (['20','30','31','32'].includes(code)) return fail('apiAuth', 502)
    if (!['0000','00','03'].includes(code)) return fail('apiFailed', 502)
    const body = response.body
    const total = code === '03' ? 0 : Number(body?.totalCount)
    if (!Number.isInteger(total) || total < 0) return fail('apiFailed', 502)
    const rows = body?.items?.item
    if (total > 0 && !rows && (page - 1) * size < total) return fail('apiFailed', 502)
    const fetchedAt = new Date().toISOString()
    const items: TourPlace[] = []
    for (const row of Array.isArray(rows) ? rows : rows ? [rows] : []) {
      if (text(row.lDongRegnCd) !== '47' || text(row.lDongSignguCd) !== '130' ||
        text(row.contenttypeid) !== types[kind] || !text(row.title) || !text(row.contentid)) continue
      if (id && text(row.contentid) !== id) continue
      if (['취소','행사연기','연기'].includes(text(row.progresstype))) continue
      items.push(normalize(row, fetchedAt))
    }
    const result: TourPage = { items, more: !id && page * size < total, fetchedAt }
    const out = Response.json(result, { headers: { 'Cache-Control': 'public, max-age=' + ttl } })
    ctx.waitUntil(cache.put(cacheKey, out.clone()).catch(() => undefined))
    return out
  } catch { return fail('apiFailed', 502) }
}
