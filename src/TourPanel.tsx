import { useEffect, useState } from 'react'
import { MapView } from './MapView'
import type { Language, Messages } from './i18n'
import type { TourKind, TourPage, TourPlace } from './tourData'

const pending = new Map<string, Promise<TourPage>>()
function read(kind: TourKind, args: string) {
  const path = '/api/tour?kind=' + kind + '&' + args
  const existing = pending.get(path)
  if (existing) return existing
  const request = fetch(path).then(async res => {
    const body = await res.json()
    if (!res.ok) throw new Error(['apiAuth','apiKey','tourQuota','apiLimit'].includes(body.error) ? body.error : 'apiFailed')
    return body as TourPage
  }).finally(() => pending.delete(path))
  pending.set(path, request)
  return request
}

interface Props {
  labels: Messages; language: Language; eventsOnly: boolean; date: string
  setDate: (date: string) => void
  savedPlaces: TourPlace[]; togglePlace: (place: TourPlace) => void
  selected: TourPlace | null; select: (place: TourPlace | null) => void
}
export function TourPanel({ labels, language, eventsOnly, date, setDate, selected, select, savedPlaces, togglePlace }: Props) {
  const [tab, setTab] = useState<TourKind>('attractions')
  const kind = eventsOnly ? 'festivals' : tab
  const [query,setQuery] = useState('')
  const [keyword,setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [retry, setRetry] = useState(0)
  const [data, setData] = useState<TourPage | null>(null)
  const [active, setActive] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [detailAttempt, setDetailAttempt] = useState(0)
  const [detailError, setDetailError] = useState('')
  const [locatedOnly, setLocatedOnly] = useState(false)
  useEffect(() => {
    let stale = false
    setData(null); setError(''); setActive('')
    async function load() {
      let n = kind === 'festivals' ? 1 : page
      const first = await read(kind, 'page=' + n + (keyword && kind !== 'festivals' ? '&q=' + encodeURIComponent(keyword) : ''))
      const items = [...first.items]
      let more = first.more
      while (kind === 'festivals' && more && !stale) {
        const next = await read(kind, 'page=' + (++n))
        items.push(...next.items)
        more = next.more
      }
      if (!stale) setData({ ...first, items, more })
    }
    void load().catch(e => { if (!stale) setError(e instanceof Error && e.message in errorLabels ? e.message : 'apiFailed') })
    return () => { stale = true }
  }, [kind, page, retry, keyword])
  useEffect(() => {
    let stale = false
    setDescription(''); setDetailError('')
    if (active) void read(kind, 'id=' + active).then(d => {
      if (!stale) setDescription(d.items[0]?.description ?? '')
    }).catch(e => { if (!stale) setDetailError(e instanceof Error && e.message in errorLabels ? e.message : 'apiFailed') })
    return () => { stale = true }
  }, [active, kind, detailAttempt])
  const day = date.replaceAll('-', '')
  const items = (data?.items ?? []).filter(p => kind !== 'festivals' ||
    (/^\d{8}$/.test(p.start) && /^\d{8}$/.test(p.end) && p.start <= day && day <= p.end))
  const visible = locatedOnly ? items.filter(p => p.latitude !== null && p.longitude !== null) : items
  const markers = visible.map(p => ({ ...p, id: 'tour-' + p.externalContentId }))
  const stamp = (s: string) => new Date(s).toLocaleString(language, { timeZone: 'Asia/Seoul' }) + ' KST'
  return <section className="event tour-panel">
    <h2>{labels.tourTitle}</h2>
    {!eventsOnly && <label>{labels.tourCategory}<select value={tab} onChange={e => {
      setTab(e.target.value as TourKind); setPage(1); setActive(''); setData(null)
    }}>{(['attractions','culture','dining','lodging','festivals'] as const).map(k => <option key={k} value={k}>{labels[k]}</option>)}</select></label>}
    {kind !== 'festivals' && <form onSubmit={e => {e.preventDefault();setKeyword(query.trim());setPage(1)}}>
      <label>{labels.searchPlaces}<input value={query} maxLength={60} onChange={e => setQuery(e.target.value)} /></label>
      <button>{labels.searchPlaces}</button></form>}
    {kind === 'festivals' && <label>{labels.tripDate}<input type="date" required value={date}
      onChange={e => { if (e.target.value) { setDate(e.target.value); setActive('') } }} /></label>}
    <label className="return"><input type="checkbox" checked={locatedOnly} onChange={e => setLocatedOnly(e.target.checked)} />{labels.withLocation}</label>
    {error ? <p role="alert">{labels[error]} <button onClick={() => setRetry(n => n + 1)}>{labels.refreshApi}</button></p> :
      !data ? <p role="status">{labels.loadingApi}</p> : <>
      <p><a href="https://www.data.go.kr/data/15101578/openapi.do">한국관광공사 TourAPI</a> · {stamp(data.fetchedAt)}</p>
      {!visible.length && <p>{labels[kind === 'festivals' ? 'noTourEvents' : 'apiEmpty']}</p>}
      <div className="place-grid">{visible.map(p => <article className="place-card" key={p.externalContentId}>
        <button className="secondary" aria-pressed={active === p.externalContentId} onClick={() => setActive(p.externalContentId)}>
          <strong lang="ko">{p.name}</strong></button>
        {p.imageUrl ? <figure><img loading="lazy" src={p.imageUrl} alt="" /><figcaption>한국관광공사 · KOGL {p.license}</figcaption></figure> : <div className="photo-placeholder" aria-hidden="true">✦</div>}
        <small lang="ko">{p.address}</small><small>{p.latitude !== null && p.longitude !== null ? p.latitude + ', ' + p.longitude : labels.missing}</small>
        {kind === 'festivals' && <><small>{p.start}–{p.end} · {labels.timeUnknown}</small>
          <label><input type="checkbox" checked={selected?.externalContentId === p.externalContentId}
            onChange={e => select(e.target.checked ? p : null)} /> {labels.add}</label></>}
        {kind !== 'festivals' && <label className="return"><input type="checkbox" checked={savedPlaces.some(v => v.externalContentId === p.externalContentId)}
          onChange={() => togglePlace(p)} />{labels.savePlace}</label>}
        {active === p.externalContentId && description && <p lang="ko">{description}</p>}
        {active === p.externalContentId && detailError && <p role="status">{labels[detailError]} <button onClick={() => setDetailAttempt(n => n+1)}>{labels.refreshApi}</button></p>}
      </article>)}</div>
      {kind !== 'festivals' && <div className="actions">
        {page > 1 && <button onClick={() => setPage(n => n - 1)}>← {labels.back}</button>}
        {data.more && <button onClick={() => setPage(n => n + 1)}>{labels.next} →</button>}</div>}
      {markers.some(p => p.latitude !== null && p.longitude !== null) &&
        <MapView places={markers} selectedIds={active ? ['tour-' + active] : []} originIds={[]} labels={labels} />}
    </>}
    {selected && <p>{labels.event} · <span lang="ko">{selected.name}</span> · {labels.tourUnscheduled}</p>}
  </section>
}
const errorLabels = { apiLimit: true, apiAuth: true, apiKey: true, tourQuota: true, apiFailed: true }
