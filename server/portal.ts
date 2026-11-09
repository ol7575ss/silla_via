import { XMLParser, XMLValidator } from 'fast-xml-parser'

export class ProviderError extends Error {
  constructor(readonly key: string, readonly status: number) { super(key) }
}

// URLSearchParams performs the one encoding step required on the wire.
export function portalKey(secret: string) {
  const value = secret.trim()
  return /%[\da-f]{2}/i.test(value) ? decodeURIComponent(value) : value
}
export function diagnostic(service: string, operation: string, http: number, code: string, count: number | null, parseFailed = false, auth = false) {
  console.info(JSON.stringify({ service, operation, http, code: /^[A-Z0-9_-]{1,32}$/.test(code) ? code : 'UNKNOWN', count, parseFailed, auth }))
}
export async function portalEnvelope(res: Response, service: string, operation: string) {
  const raw = (await res.text()).trim()
  let payload
  let code = ''
  let parseFailed = false
  try {
    let root
    if (raw.startsWith('<')) {
      if (/<!DOCTYPE/i.test(raw) || XMLValidator.validate(raw) !== true) throw new Error()
      root = new XMLParser({ parseTagValue: false, ignoreAttributes: true }).parse(raw)
    } else root = JSON.parse(raw)
    payload = root.response
    code = String(payload?.header?.resultCode ?? root.OpenAPI_ServiceResponse?.cmmMsgHeader?.returnReasonCode ?? '')
    parseFailed = !code
  } catch { parseFailed = true }
  const n = /^\d+$/.test(code) ? Number(code) : -1
  const auth = [401,403].includes(res.status) || [20,30,31,32,33].includes(n) || /SERVICE_KEY|ACCESS_DENIED|UNREGISTERED_IP/i.test(raw.slice(0,1000))
  const quota = res.status === 429 || n === 22 || /LIMITED_NUMBER_OF_SERVICE_REQUESTS/.test(raw.slice(0,1000))
  if (quota || auth || !res.ok || parseFailed || (n !== 0 && n !== 3)) {
    diagnostic(service, operation, res.status, code, null, parseFailed, auth)
    throw new ProviderError(quota ? 'apiLimit' : auth ? 'apiAuth' : 'apiFailed',quota ? 429 : 502)
  }
  return { payload, empty: n === 3, code }
}
export async function portalPage(res: Response, service: string, operation: string) {
  const { payload, empty, code } = await portalEnvelope(res,service,operation)
  if (empty) { diagnostic(service, operation,res.status,code,0); return { rows: [], total: 0 } }
  if (!payload?.body) throw new ProviderError('apiFailed',502)
  const items = payload.body.items?.item
  const rows: Record<string, unknown>[] = Array.isArray(items) ? items : items && typeof items === 'object' ? [items] : []
  diagnostic(service,operation,res.status,code,rows.length)
  const total = Number(payload.body.totalCount ?? (rows.length || NaN))
  if (!Number.isInteger(total) || total < 0 || (!rows.length && total > 0)) throw new ProviderError('apiFailed',502)
  return { rows, total }
}

