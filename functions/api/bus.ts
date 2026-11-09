import type { BusArrivals } from '../../src/liveData'

interface Env { BUS_API_KEY?: string; BUS_PROVIDER?: string; BUS_CITY_CODE?: string; BUS_STOP_ID?: string }

export async function onRequestGet({ env }: { env: Env }) {
  const fail = (error: string, status = 502) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } })
  if (env.BUS_PROVIDER !== 'TAGO_ARRIVALS') return fail('busUnsupported', 501)
  if (!env.BUS_API_KEY?.trim()) return fail('apiKey', 503)
  if (!env.BUS_CITY_CODE || !env.BUS_STOP_ID) return fail('busConfig', 503)
  try {
    const url = new URL('https://apis.data.go.kr/1613000/ArvlInfoInqireService/getSttnAcctoArvlPrearngeInfoList')
    url.search = new URLSearchParams({ serviceKey: decodeURIComponent(env.BUS_API_KEY.trim()), _type: 'json',
      cityCode: env.BUS_CITY_CODE, nodeId: env.BUS_STOP_ID, numOfRows: '100', pageNo: '1' }).toString()
    const upstream = await fetch(url, { signal: AbortSignal.timeout(10000), redirect: 'error' })
    const body = await upstream.text()
    if ([401,403].includes(upstream.status) || /SERVICE_KEY|ACCESS_DENIED|UNREGISTERED_IP/i.test(body)) return fail('apiAuth')
    if (!upstream.ok) return fail('apiFailed')
    const response = JSON.parse(body).response
    const code = String(response?.header?.resultCode)
    if (['20','30','31','32','33'].includes(code)) return fail('apiAuth')
    if (code === '03') return fail('apiEmpty', 404)
    if (code !== '00') return fail('apiFailed')
    const items = response.body?.items?.item
    const rows = Array.isArray(items) ? items : items ? [items] : []
    const arrivals: BusArrivals['arrivals'] = []
    for (const row of rows) {
      if (!row?.nodeid || !row.nodenm || row.routeno == null || !/^\d+$/.test(String(row.arrtime))) continue
      arrivals.push({ stop: { id: String(row.nodeid), name: String(row.nodenm), latitude: null, longitude: null },
        route: String(row.routeno), seconds: Number(row.arrtime) })
    }
    if (!arrivals.length && Number(response.body?.totalCount) !== 0) return fail('apiFailed')
    const result: BusArrivals = { source: 'https://www.data.go.kr/data/15098530/openapi.do', fetchedAt: new Date().toISOString(), arrivals }
    return Response.json(result, { headers: { 'Cache-Control': 'public, max-age=20' } })
  } catch { return fail('apiFailed') }
}
