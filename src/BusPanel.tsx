import { useEffect, useRef, useState } from 'react'
import type { Language, Messages } from './i18n'
import type { BusItem, BusPage } from './liveData'

type Action = 'stops' | 'routes' | 'detail' | 'arrivals'
interface Result extends BusPage { action: Action; value: string; page: number }

export function BusPanel({ labels, language }: { labels: Messages; language: Language }) {
  const [query, setQuery] = useState('')
  const [stop, setStop] = useState<BusItem | null>(null)
  const [results, setResults] = useState<Partial<Record<Action, Result>>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef<AbortController | null>(null)
  useEffect(() => () => pending.current?.abort(), [])
  async function lookup(action: Action, value: string, page = 1) {
    if (pending.current) return
    const controller = new AbortController()
    pending.current = controller
    setBusy(true); setError('')
    setResults(prev => {
      if (action === 'stops') return {}
      if (action === 'routes') return { stops: prev.stops }
      return { ...prev, [action]: undefined }
    })
    if (action === 'stops') setStop(null)
    try {
      const params = new URLSearchParams({ action, [action === 'stops' ? 'q' : 'id']: value, page: String(page) })
      const res = await fetch('/api/bus?' + params, { signal: controller.signal })
      const data = await res.json()
      if (controller.signal.aborted) return
      if (!res.ok) {
        setError(['apiKey','apiAuth','apiLimit','busInvalid','busRegion'].includes(data.error) ? data.error : 'apiFailed')
        return
      }
      setResults(prev => ({ ...prev, [action]: { ...data, action, value, page } }))
    } catch { if (!controller.signal.aborted) setError('apiFailed') }
    finally { pending.current = null; if (!controller.signal.aborted) setBusy(false) }
  }
  function list(result: Result | undefined) {
    if (!result) return null
    return <div><ul>{result.items.map((item,i) => <li key={item.id + '/' + i}>
      {result.action === 'stops' ? <button type="button" disabled={busy} onClick={() => {
        setStop(item); void lookup('routes', item.id)
      }}>{item.name} · {item.id}</button> : result.action === 'routes' ?
        <button type="button" disabled={busy} onClick={() => lookup('detail', item.id)}>{labels.bus} {item.name}</button> :
        <>{item.stop} {labels.bus} {item.name}</>}
      {item.start && ' · ' + item.start}{item.end && ' → ' + item.end}
      {item.seconds !== undefined && ' · ' + Math.ceil(item.seconds / 60) + ' ' + labels.unit}
    </li>)}</ul>
      {!result.items.length && <p>{labels.apiEmpty}</p>}
      <small>TAGO · {new Date(result.fetchedAt).toLocaleString(language, { timeZone: 'Asia/Seoul' })} KST</small>
      {result.page > 1 && <button disabled={busy} onClick={() => lookup(result.action,result.value,result.page - 1)}>{labels.back}</button>}
      {result.more && <button disabled={busy} onClick={() => lookup(result.action,result.value,result.page + 1)}>{labels.next}</button>}
    </div>
  }
  return <section className="weather-panel">
    <h2>{labels.busStops}</h2>
    <form onSubmit={e => { e.preventDefault(); if (query.trim()) void lookup('stops',query.trim()) }}>
      <label>{labels.stopName}<input value={query} maxLength={30} onChange={e => setQuery(e.target.value)} /></label>
      <button disabled={busy || !query.trim()}>{labels.searchStops}</button>
    </form>
    {list(results.stops)}
    {stop && <><h3>{stop.name} · {stop.id}</h3><strong>{labels.stopRoutes}</strong>
      {list(results.routes)}{list(results.detail)}
      <div className="actions"><button disabled={busy} onClick={() => lookup('arrivals',stop.id)}>{labels.busArrivals}</button></div>
      {list(results.arrivals)}</>}
    {busy && <p role="status">{labels.loadingApi}</p>}{error && <p role="alert">{labels[error]}</p>}
  </section>
}
