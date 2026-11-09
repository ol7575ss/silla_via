import { useRef, useState } from 'react'
import type { BusPage } from './liveData'
import type { Messages } from './i18n'

// Mounted only in the development diagnostics area. Never poll the city API.
export function BusPanel({ labels }: { labels: Messages }) {
  const [q,setQ] = useState('')
  const [action,setAction] = useState('stops')
  const [data,setData] = useState<BusPage | null>(null)
  const [error,setError] = useState('')
  const [busy,setBusy] = useState(false)
  const [last,setLast] = useState({ action: '', q: '', page: 1 })
  const lock = useRef(false)
  async function load(kind: string, value: string, page = 1) {
    if (!value.trim() || lock.current) return
    lock.current = true
    setBusy(true); setError(''); setData(null); setLast({ action: kind,q: value,page })
    try {
      const res = await fetch('/api/bus?' + new URLSearchParams({ action: kind, q: value, page: String(page) }))
      const body = await res.json()
      if (res.ok) setData(body)
      else setError(['apiKey','apiLimit','apiAuth','busInvalid'].includes(body.error) ? body.error : 'apiFailed')
    } catch { setError('apiFailed') } finally { lock.current = false; setBusy(false) }
  }
  return <section><form onSubmit={e => {e.preventDefault(); void load(action,q)}}>
    <select aria-label={labels.bus} value={action} onChange={e => {setAction(e.target.value);setData(null);setQ('')}}>
      <option value="stops">{labels.stopName}</option><option value="routes">{labels.bus}</option></select>
    <input aria-label={action === 'stops' ? labels.stopName : labels.bus} value={q} onChange={e => setQ(e.target.value)} />
    <button disabled={busy || !q.trim()}>{labels.refreshApi}</button></form>
    {error && <p role="alert">{labels[error]} <button onClick={() => load(last.action,last.q,last.page)}>{labels.refreshApi}</button></p>}
    {busy && <p>{labels.loadingApi}</p>}
    {data && <><p>경주시 · {data.fetchedAt}</p>{!data.items.length && <p>{labels.apiEmpty}</p>}
      <ul>{data.items.map((r,i) => <li key={i}>{last.action === 'routes' && r.id
        ? <button onClick={() => load('positions',r.id)}>{r.name}</button> : r.name} {r.stop} {r.start} {r.end}</li>)}</ul>
      {data.more && <button onClick={() => load(last.action,last.q,last.page+1)}>{labels.next}</button>}</>}
  </section>
}
