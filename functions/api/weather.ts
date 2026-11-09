import { diagnostic, portalKey, portalPage, ProviderError } from '../../server/portal'
import type { Forecast, ForecastHour } from '../../src/liveData'

const HOUR = 3600000
const SOURCE = 'https://www.data.go.kr/data/15084084/openapi.do'
const endpoint = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst'
type Context = { request: Request; env: { KMA_API_KEY?: string }; waitUntil(promise: Promise<unknown>): void }

function koreanStamp(ms: number) {
  const iso = new Date(ms + 9 * HOUR).toISOString()
  return { date: iso.slice(0, 10).replaceAll('-', ''), time: iso.slice(11, 16).replace(':', '') }
}

function failure(error: string, status = 502) {
  return Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function onRequestGet(ctx: Context) {
  const { request, env } = ctx
  if (!env.KMA_API_KEY?.trim()) return failure('apiKey', 503)
  const kind = new URL(request.url).searchParams.get('kind') ?? 'daily'
  if (!['daily','observed','near'].includes(kind)) return failure('apiFailed',400)
  const now = Date.now()
  // KST issues at 02, 05, ..., 23. Publication starts ten minutes later.
  const daily = kind === 'daily'
  const operation = daily ? 'getVilageFcst' : kind === 'near' ? 'getUltraSrtFcst' : 'getUltraSrtNcst'
  const lag = kind === 'near' ? 45 : kind === 'observed' ? 40 : 10
  const hour = Math.floor((now - lag * 60000) / HOUR)
  const issue = daily ? (hour - ((hour + 9 - 2) % 3)) * HOUR : hour * HOUR + (kind === 'near' ? 1800000 : 0)
  let base = koreanStamp(issue)
  const cacheKey = new Request(new URL('/api/weather-cache-v3/' + kind + '?issue=' + issue, request.url))
  const cache = (caches as CacheStorage & { default: Cache }).default
  try {
    const cached = await cache.match(cacheKey).catch(() => undefined)
    if (cached) return cached
    const url = new URL(endpoint.replace(/getVilageFcst$/, operation))
    const items: Record<string, unknown>[] = []
    let delayed = false
    for (const issued of [issue, issue - (daily ? 3 : 1) * HOUR]) {
      base = koreanStamp(issued)
      for (let page = 1; ; page++) {
        url.search = new URLSearchParams({ serviceKey: portalKey(env.KMA_API_KEY), dataType: 'JSON',
          pageNo: String(page), numOfRows: '1000', base_date: base.date, base_time: base.time, nx: '100', ny: '91' }).toString()
        const res = await fetch(url, { signal: AbortSignal.timeout(12000), redirect: 'manual' })
        const result = await portalPage(res, 'KMA', operation)
        items.push(...result.rows)
        if (items.length >= result.total || !result.rows.length) break
        if (page >= 10) throw new ProviderError('apiFailed',502)
      }
      if (items.length) break
      delayed = true
    }
    if (!items.length) return failure('apiEmpty',404)
    if (!daily) {
      const samples = new Map<string,{date: string; time: string; precipitationType: number | null; temperature: number | null; rainfall: string | null}>()
      for (const item of items) {
        const obs = kind === 'observed'
        const date = String(obs ? item.baseDate : item.fcstDate)
        const time = String(obs ? item.baseTime : item.fcstTime).padStart(4,'0')
        const raw = String((obs ? item.obsrValue : item.fcstValue) ?? '').trim()
        if (!/^\d{8}$/.test(date) || !/^\d{4}$/.test(time) || !raw || /^-99[89]$/.test(raw)) continue
        const sample = samples.get(date+time) ?? {date,time,precipitationType:null,temperature:null,rainfall:null}
        if (item.category === 'PTY' && Number.isFinite(Number(raw))) sample.precipitationType = Number(raw)
        else if (item.category === 'T1H' && Number.isFinite(Number(raw))) sample.temperature = Number(raw)
        else if (item.category === 'RN1') sample.rainfall = raw
        else continue
        samples.set(date+time,sample)
      }
      if (!samples.size) return failure('apiFailed')
      const out = Response.json({ kind, ...base, fetchedAt: new Date(now).toISOString(), samples: [...samples.values()] },
        { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' } })
      ctx.waitUntil(cache.put(cacheKey,out.clone()).catch(() => undefined))
      return out
    }
    const byTime = new Map<string, ForecastHour>()
    for (const item of items) {
      const date = String(item.fcstDate ?? ''), time = String(item.fcstTime ?? '').padStart(4,'0')
      if (!/^\d{8}$/.test(date) || !/^\d{4}$/.test(time)) continue
      const key = date + time
      const h = byTime.get(key) ?? { fcstDate: date, fcstTime: time, POP: null, PCP: null, PTY: null, SKY: null, TMP: null }
      byTime.set(key,h)
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
    const hours = [...byTime.values()].sort((a,b) => (a.fcstDate+a.fcstTime).localeCompare(b.fcstDate+b.fcstTime))
    if (!hours.some(h => [h.POP, h.PTY, h.PCP, h.SKY, h.TMP].some(value => value !== null))) return failure('apiEmpty', 404)
    const forecast: Forecast = { source: SOURCE, fetchedAt: new Date(now).toISOString(), baseDate: base.date, baseTime: base.time, hours }
    const response = Response.json(forecast, { headers: { 'Cache-Control': delayed ? 'public, max-age=30, s-maxage=60' : 'public, max-age=60, s-maxage=600' } })
    ctx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined))
    return response
  } catch (e) { if (e instanceof ProviderError) return failure(e.key,e.status); diagnostic('KMA',operation,0,'REQUEST_FAILED',null); return failure('apiFailed') }
}
