import type { Forecast, ForecastHour } from '../../src/liveData'

const HOUR = 3600000
const SOURCE = 'https://www.data.go.kr/data/15084084/openapi.do'
const endpoint = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst'
type Context = { request: Request; env: { KMA_API_KEY?: string }; waitUntil(promise: Promise<unknown>): void }
type Item = { fcstDate: string; fcstTime: string; category: string; fcstValue: string | number }

function koreanStamp(ms: number) {
  const iso = new Date(ms + 9 * HOUR).toISOString()
  return { date: iso.slice(0, 10).replaceAll('-', ''), time: iso.slice(11, 16).replace(':', '') }
}

function failure(error: string, status = 502) {
  return Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function onRequestGet({ request, env, waitUntil }: Context) {
  if (!env.KMA_API_KEY?.trim()) return failure('apiKey', 503)
  const now = Date.now()
  // KST issues at 02, 05, ..., 23. Publication starts ten minutes later.
  const available = now - 600000
  const hour = Math.floor(available / HOUR)
  const issue = (hour - ((hour + 9 - 2) % 3)) * HOUR
  const base = koreanStamp(issue)
  const cacheKey = new Request(new URL('/api/weather?issue=' + issue, request.url))
  const cache = (caches as CacheStorage & { default: Cache }).default
  try {
    const cached = await cache.match(cacheKey)
    if (cached) return cached
    const url = new URL(endpoint)
    url.search = new URLSearchParams({ serviceKey: decodeURIComponent(env.KMA_API_KEY.trim()), dataType: 'JSON',
      pageNo: '1', numOfRows: '500', base_date: base.date, base_time: base.time, nx: '100', ny: '91' }).toString()
    const upstream = await fetch(url, { signal: AbortSignal.timeout(12000), redirect: 'error' })
    const body = await upstream.text()
    if (upstream.status === 429 || /LIMITED_NUMBER_OF_SERVICE_REQUESTS/.test(body)) return failure('apiLimit', 429)
    if (upstream.status === 401 || upstream.status === 403 || /SERVICE_KEY|ACCESS_DENIED|UNREGISTERED_IP/i.test(body)) return failure('apiAuth')
    if (!upstream.ok) return failure('apiFailed')
    const payload = JSON.parse(body).response
    const code = String(payload?.header?.resultCode)
    if (['20','30','31','32','33'].includes(code)) return failure('apiAuth')
    if (code === '22') return failure('apiLimit', 429)
    if (code === '03') return failure('apiEmpty', 404)
    if (code !== '00') return failure('apiFailed')
    const items: Item[] = payload.body?.items?.item
    if (!Array.isArray(items) || !items.length) return failure('apiEmpty', 404)
    const hours: ForecastHour[] = []
    for (let i = 1; i <= 24; i++) {
      const { date, time } = koreanStamp(issue + i * HOUR)
      hours.push({ fcstDate: date, fcstTime: time, POP: null, PCP: null, PTY: null, SKY: null, TMP: null })
    }
    const byTime = new Map(hours.map(h => [h.fcstDate + h.fcstTime, h]))
    for (const item of items) {
      const h = byTime.get(item.fcstDate + item.fcstTime)
      if (!h || item.fcstValue == null) continue
      const value = String(item.fcstValue).trim()
      if (!value || value === '-999' || value === '-998') continue
      const k = item.category
      if (k === 'PCP') h.PCP = value
      else if (k === 'POP' || k === 'PTY' || k === 'SKY' || k === 'TMP') {
        const n = Number(value)
        if (Number.isFinite(n)) h[k] = n
      }
    }
    if (!hours.some(h => [h.POP, h.PTY, h.PCP, h.SKY, h.TMP].some(value => value !== null))) return failure('apiEmpty', 404)
    const forecast: Forecast = { source: SOURCE, fetchedAt: new Date(now).toISOString(), baseDate: base.date, baseTime: base.time, hours }
    const response = Response.json(forecast, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=600' } })
    waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined))
    return response
  } catch { return failure('apiFailed') }
}


