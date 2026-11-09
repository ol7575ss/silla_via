import { useEffect, useRef, useState } from 'react'
import type { Language, Messages } from './i18n'
import { routePairs } from './routing'
import type { RouteMode, RouteSummary } from './routing'

export function RoutingPanel({ labels, language }: { labels: Messages; language: Language }) {
  const [index, setIndex] = useState(0)
  const [mode, setMode] = useState<RouteMode>('WALK')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [route, setRoute] = useState<RouteSummary | null>(null)
  const flight = useRef<AbortController | null>(null)
  useEffect(() => () => flight.current?.abort(), [])
  const [from, to] = routePairs[index]
  const format = new Intl.NumberFormat(language)
  const minutes = (seconds: number) => format.format(Math.ceil(seconds / 60)) + ' ' + labels.unit
  function clear() { setRoute(null); setError('') }
  async function lookup() {
    if (flight.current || route) return
    const controller = new AbortController()
    flight.current = controller
    setBusy(true); setError('')
    try {
      const query = new URLSearchParams({ from, to, mode })
      const response = await fetch('/api/routing?' + query, { signal: controller.signal, cache: 'no-store' })
      const body = await response.json()
      if (controller.signal.aborted) return
      if (response.ok && body.ok) setRoute(body)
      else setError(['routeEmpty','routeQuota','apiAuth','apiKey','missing'].includes(body.error) ? body.error : 'apiFailed')
    } catch {
      if (!controller.signal.aborted) setError('apiFailed')
    } finally {
      flight.current = null
      if (!controller.signal.aborted) setBusy(false)
    }
  }
  return <section className="weather-panel">
    <h2>{labels.liveRoute}</h2>
    <label>{labels.routePair}<select value={index} disabled={busy} onChange={e => { clear(); setIndex(Number(e.target.value)) }}>
      {routePairs.map(([a,b], i) => <option key={a} value={i}>{labels[a]} → {labels[b]}</option>)}
    </select></label>
    <label>{labels.routeMode}<select value={mode} disabled={busy} onChange={e => { clear(); setMode(e.target.value as RouteMode) }}>
      <option value="WALK">{labels.walk}</option><option value="PUBLIC_TRANSIT">{labels.transit}</option>
    </select></label>
    <div className="actions"><button type="button" disabled={busy || !!route} onClick={lookup}>{busy ? labels.loadingApi : labels.lookupRoute}</button></div>
    {error && <p role="alert">{labels[error]}</p>}
    {route && <div aria-live="polite">
      <p><strong>{minutes(route.seconds)} · {format.format(route.meters)} m</strong>
        {route.transfers !== null && <> · {labels.transfers} {route.transfers}</>}</p>
      <ol>{route.steps.map((s,i) => <li key={i}>
        <strong>{s.type === 'WALKING' ? labels.walk : s.type === 'BUS' ? labels.bus : s.type === 'SUBWAY' ? labels.metro : s.type}</strong>
        {' '}{s.vehicles.join(' / ')} {s.seconds !== null && minutes(s.seconds)} {s.meters !== null && format.format(s.meters) + ' m'}
        {s.board && <div>{labels.board} · {s.board}</div>}{s.alight && <div>{labels.alight} · {s.alight}</div>}
        {s.guidance && <small>{s.guidance}</small>}
      </li>)}</ol>
      <p>{route.source} · {new Date(route.fetchedAt).toLocaleString(language, { timeZone: 'Asia/Seoul' })} KST</p>
      {route.landingUrl && <a href={route.landingUrl} target="_blank" rel="noreferrer">{labels.openKakao}</a>}
    </div>}
  </section>
}
