import { useEffect, useMemo, useState } from 'react'
import { languages, messages, savedLanguage } from './i18n'
import type { Language, Messages } from './i18n'
import { destinations, origins, performance } from './tripData'
import type { Theme, TripPreferences } from './tripData'
import { JourneyResult } from './JourneyResult'
import { InstallHint } from './InstallHint'
import { LivePanel } from './LivePanel'
import { TourPanel } from './TourPanel'
import type { TourPlace } from './tourData'
import { RoutingPanel } from './RoutingPanel'
import './App.css'

const styles: [string,string,Theme[]][] = [
  ['historyStyle','⌂',['history']], ['cafeStyle','☕',['food']], ['foodStyle','♨',['food']],
  ['photoStyle','◎',['photography']], ['natureStyle','❧',['nature']],
  ['experienceStyle','✧',['art','history']], ['familyStyle','☀',['nature','art']],
]
const tools = import.meta.env.DEV && new URLSearchParams(location.search).has('tools')
const locations = [...origins, ...destinations]
const steps = ['styleTitle','detailsTitle','mustTitle','eventTitle','journey']
function initialStep() {
  try { return Object.hasOwn(languages, localStorage.getItem('silla-via.language') ?? '') ? 0 : -1 }
  catch { return -1 }
}
export default function App() {
  const [step,go] = useState(initialStep)
  const [language,setLanguage] = useState(savedLanguage)
  const en = useMemo(() => messages(language),[language])
  const [live,setLive] = useState(true)
  const [date,setDate] = useState(() => new Date(Date.now()+9*3600000).toISOString().slice(0,10))
  const [hotel,setHotel] = useState<TourPlace | null>(null)
  const [end,setEnd] = useState('')
  const [selectedStyles,setStyles] = useState<string[]>([])
  const [trip,setTrip] = useState<TripPreferences>({originId:'', destinationIds:[], themes:[], eventId:null, returnToOrigin:false,startTime:'10:00',endTime:'18:00'})
  const [saved,setSaved] = useState<TourPlace[]>([])
  const [event,setEvent] = useState<TourPlace | null>(null)
  const [risk,setRisk] = useState(false)
  const [error,setError] = useState('')
  const [showHotel,setShowHotel] = useState(false)
  const hotelId = hotel ? 'tour-' + hotel.externalContentId : ''
  const labels = useMemo<Messages>(() => hotel ? {...en,[hotelId]:hotel.name} : en,[en,hotelId,hotel])
  const chooseLanguage = (id:Language) => {
    setLanguage(id)
    try { localStorage.setItem('silla-via.language',id) } catch { /* Storage unavailable */ }
  }
  useEffect(() => { document.documentElement.lang = language },[language])
  useEffect(() => { window.scrollTo(0,0); setError('') },[step])
  const update = (fields:Partial<TripPreferences>) => setTrip(prev => ({...prev,...fields}))
  const options = <>{locations.map(p => <option key={p.id} value={p.id}>{en[p.id]}</option>)}
    {hotel && <option value={hotelId}>{hotel.name}</option>}</>
  const coordinates = (id:string) => {
    const p = id === hotelId ? hotel : locations.find(v => v.id === id)
    return p && <small>{p.latitude != null && p.longitude != null ? [p.latitude,p.longitude].join(', ') : en.missing}</small>
  }
  function toggleStyle(key:string) {
    const next = selectedStyles.includes(key) ? selectedStyles.filter(k => k !== key) : [...selectedStyles,key]
    setStyles(next)
    const themes = [...new Set(styles.filter(([id]) => next.includes(id)).flatMap(s => s[2]))]
    update({themes,eventId:themes.includes('history') ? trip.eventId : null})
  }
  function toggleLocal(id:string) {
    update({destinationIds:trip.destinationIds.includes(id) ? trip.destinationIds.filter(v => v !== id) : [...trip.destinationIds,id]})
  }
  function toggleSaved(p:TourPlace) {
    setSaved(prev => prev.some(v => v.externalContentId === p.externalContentId) ? prev.filter(v => v.externalContentId !== p.externalContentId) : [...prev,p])
  }
  function chooseHotel(p:TourPlace) {
    const next = hotel?.externalContentId === p.externalContentId ? null : p
    if (hotel && trip.originId === hotelId) update({originId:''})
    if (hotel && end === hotelId) setEnd('')
    setHotel(next); setShowHotel(false)
  }
  function advance() {
    if (step === 2) {
      if (!date) return setError('dateError')
      if (!trip.originId || !trip.startTime || !trip.endTime) return setError('invalid')
      if (trip.startTime >= trip.endTime) return setError('timeRange')
    }
    if (step === 3 && trip.destinationIds.length > 5) return setError('limit')
    go(step+1)
  }
  const panelProps = {labels:en,language,date,selected:event,select:setEvent,savedPlaces:saved,togglePlace:toggleSaved}
  return <main className="travel-app">
    <header><strong><img src="/icons/demo.svg" alt="" />Silla Via</strong>
      <select className="locale" aria-label={en.language} value={language} onChange={e => chooseLanguage(e.target.value as Language)}>
        {Object.entries(languages).map(([id,name]) => <option key={id} value={id} lang={id}>{name}</option>)}</select></header>
    {step === -1 && <section className="language-page"><h1>{en.language}</h1><div className="language-grid">
      {Object.entries(languages).map(([id,name]) => <button key={id} lang={id} onClick={() => { chooseLanguage(id as Language); go(0) }}>{name}<span>→</span></button>)}</div></section>}
    {step === 0 && <section className="welcome"><figure className="heritage-photo"><img src="/cheomseongdae.jpg" alt={en.cheomseongdae}/>
      <figcaption><a href="https://commons.wikimedia.org/wiki/File:Cheomseongdae_첨성대.jpg">© Mosbatho</a> · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a></figcaption></figure>
      <div className="copy"><small className="location">{en.location}</small><h1>{en.discover}</h1><p>{en.intro}</p><button onClick={() => go(1)}>{en.begin} →</button></div></section>}
    {step > 0 && <section className="flow"><nav><button className="back" onClick={() => go(step-1)}>← {en.back}</button><span>{step} / 5</span></nav>
      <progress aria-label={en[steps[step-1]]} value={step} max={5}/><h1>{en[steps[step-1]]}</h1>
      {step === 1 && <div className="style-grid">{styles.map(([key,icon]) => <button key={key} aria-pressed={selectedStyles.includes(key)} onClick={() => toggleStyle(key)}>
        <i aria-hidden="true">{icon}</i>{en[key]}<span aria-hidden="true">{selectedStyles.includes(key) ? '✓' : '+'}</span></button>)}</div>}
      {step === 2 && <div className="detail-fields"><label>{en.tripDate}<input type="date" required value={date} onChange={e => { setDate(e.target.value); setEvent(null) }}/></label>
        <div className="times">{(['startTime','endTime'] as const).map((k,i) => <label key={k}>{en[i ? 'until':'from']}<input type="time" required value={trip[k]} onChange={e => update({[k]:e.target.value})}/></label>)}</div>
        {live && <div><small>{en.hotelOptional}</small><button className="field-button" aria-expanded={showHotel} onClick={() => setShowHotel(!showHotel)}>{hotel?.name ?? en.hotelSearch} ⌄</button>
          {hotel && <button className="secondary" onClick={() => chooseHotel(hotel)}>{en.noPreference}</button>}
          {showHotel && <TourPanel {...panelProps} eventsOnly={false} hotelOnly savedPlaces={hotel ? [hotel] : []} togglePlace={chooseHotel}/>}</div>}
        <label>{en.origin}<select value={trip.originId} onChange={e => update({originId:e.target.value})}><option value="">{en.placeholder}</option>{options}</select>{coordinates(trip.originId)}</label>
        <label>{en.endPlace}<select value={end} onChange={e => setEnd(e.target.value)}><option value="">{en.noPreference}</option>{options}</select>{end && coordinates(end)}</label></div>}
      {step === 3 && <>{live && <details className="find-places"><summary>{en.searchPlaces}</summary><TourPanel {...panelProps} eventsOnly={false}/></details>}<h2>{en.timedPlaces}</h2><div className="local-list">{destinations.map(p => <button key={p.id} aria-pressed={trip.destinationIds.includes(p.id)} onClick={() => toggleLocal(p.id)}>
        {p.id === 'cheomseongdae' && <img src="/cheomseongdae.jpg" alt=""/>}<strong>{en[p.id]}</strong><small>{p.themes.map(t => en[t]).join(' · ')}</small><span>{en[p.id+'Intro']}</span><b>{trip.destinationIds.includes(p.id) ? '✓' : '+'}</b></button>)}</div>
        {!!(saved.length + trip.destinationIds.length) && <aside><h2>{en.selectedPlaces}</h2><div className="chips">
          {trip.destinationIds.map(id => <button key={id} onClick={() => toggleLocal(id)}>{en[id]} ×</button>)}
          {saved.map(p => <button key={p.externalContentId} onClick={() => toggleSaved(p)}>{p.name} ×</button>)}</div></aside>}
        </>}
      {step === 4 && (live ? <TourPanel {...panelProps} eventsOnly/> : trip.themes.includes('history') ? <article className="event"><small>{en.demo}</small><h2>{en.eventName}</h2><p>{en.venue} · {performance.startTime}–{performance.endTime}</p><button aria-pressed={!!trip.eventId} onClick={() => update({eventId:trip.eventId ? null : performance.id})}>{trip.eventId ? en.selected : en.add}</button></article> : <p>{en.empty}</p>)}
      {step < 5 && <div className="journey-actions">{error && <p role="alert">{en[error]}</p>}{step === 4 && <button className="secondary" onClick={() => {setEvent(null);update({eventId:null});go(5)}}>{en.skip}</button>}
        <button onClick={advance}>{step === 4 ? en.generate : en.next} →</button></div>}
      {step === 5 && <><p>{date} · {trip.startTime}–{trip.endTime}<br/>{labels[trip.originId]}{end && ' → '+labels[end]}{hotel && <><br/>{en.lodging} · {hotel.name}</>}</p>
        {live && saved.length > 0 && <aside><h2>{en.savedPlaces}</h2>{saved.map(p => <p key={p.externalContentId}>{p.name}</p>)}</aside>}
        {live && event && <p>{en.event} · {event.name} · {en.tourUnscheduled}</p>}
        <JourneyResult hotel={hotel} trip={trip} finalId={end} labels={labels} edit={() => go(2)} live={live} forecastRisk={risk}/>
        {live && <LivePanel date={date} labels={en} language={language} start={trip.startTime} end={trip.endTime} onRisk={setRisk}/>}
        {tools && live && <RoutingPanel labels={en} language={language}/>}</>}
    </section>}
    {tools && step === 0 && <details><summary>{en.dataMode}</summary><label><input type="checkbox" checked={live} onChange={e => {setLive(e.target.checked);update({eventId:null})}}/> LIVE</label></details>}
    <InstallHint labels={en} visible={step === 0}/>
  </main>
}


