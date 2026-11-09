import { useEffect, useMemo, useState } from 'react'
import { languages, messages, savedLanguage } from './i18n'
import type { Language } from './i18n'
import { MapView } from './MapView'
import { destinations, origins, performance, themeNames } from './tripData'
import type { Theme, TripPreferences } from './tripData'
import { JourneyResult } from './JourneyResult'
import { InstallHint } from './InstallHint'
import './App.css'

type ChoiceProps<T extends string> = {
  title: string
  options: { id: T; name: string }[]
  selected: T[]
  onChange: (values: T[]) => void
}

function Choices<T extends string>({ title, options, selected, onChange }: ChoiceProps<T>) {
  return <fieldset><legend>{title}</legend><div className="choices">
    {options.map(({ id, name }) => <label key={id}>
      <input type="checkbox" checked={selected.includes(id)} onChange={e =>
        onChange(e.target.checked ? [...selected, id] : selected.filter(value => value !== id))} />
      {name}
    </label>)}
  </div></fieldset>
}

const mapPlaces = [...destinations, ...origins]
const originIds = origins.map(p => p.id)
const motifs = ['✦', '◒', '⌂', '≋', '◇', '⌂', '◈', '≋']

export default function App() {
  const [language, setLanguage] = useState(savedLanguage)
  const en = useMemo(() => messages(language), [language])
  const themes = (Object.keys(themeNames) as Theme[]).map(id => ({ id, name: en[id] }))
  const [error, setError] = useState(false)
  useEffect(() => {
    document.documentElement.lang = language
    try { localStorage.setItem('silla-via.language', language) } catch { /* Storage may be disabled. */ }
  }, [language])
  const [screen, setScreen] = useState<'welcome' | 'planner' | 'events' | 'summary'>('welcome')
  const [trip, setTrip] = useState<TripPreferences>({
    originId: '', startTime: '10:00', endTime: '18:00', themes: [],
    destinationIds: [], returnToOrigin: false, eventId: null,
  })
  const matches = performance.themes.some(theme => trip.themes.includes(theme))

  function update(fields: Partial<TripPreferences>) {
    setTrip(previous => ({ ...previous, ...fields }))
  }

  function finish(eventId: string | null) {
    update({ eventId })
    setScreen('summary')
  }

  return <main>
    <header><strong>{en.brand}</strong><label className="language">{en.language}<select value={language} onChange={e => setLanguage(e.target.value as Language)}>
      {Object.entries(languages).map(([id, name]) => <option lang={id} key={id} value={id}>{name}</option>)}
    </select></label></header>
    {screen === 'welcome' && <section className="welcome">
      <div className="landscape" aria-hidden="true"><i /></div>
      <div className="copy"><small className="location">{en.location}</small><h1>{en.title}</h1><p>{en.intro}</p>
        <button onClick={() => setScreen('planner')}>{en.start} <span aria-hidden="true">→</span></button>
      </div>
    </section>}
    {screen === 'planner' && <section className="planner">
      <button className="back" onClick={() => setScreen('welcome')}>← {en.back}</button>
      <small className="step">1 / 3</small><h1>{en.planner}</h1>
      <form noValidate onSubmit={e => {
        e.preventDefault()
        const invalid = !trip.originId || !trip.startTime || !trip.endTime
        setError(invalid)
        if (!invalid) setScreen('events')
      }}>
        <label>{en.origin}<select required value={trip.originId} onChange={e => update({ originId: e.target.value })}>
          <option value="">{en.placeholder}</option>
          {origins.map(place => <option key={place.id} value={place.id}>{en[place.id]}</option>)}
        </select></label>
        {trip.originId && origins.find(p => p.id === trip.originId)?.latitude === null && <small>{en.missing}</small>}
        <div className="times">
          <label>{en.from}<input required type="time" value={trip.startTime} onChange={e => update({ startTime: e.target.value })} /></label>
          <label>{en.until}<input required type="time" value={trip.endTime} onChange={e => update({ endTime: e.target.value })} /></label>
        </div>
        <Choices title={en.interests} options={themes} selected={trip.themes} onChange={values =>
          update({ themes: values, eventId: performance.themes.some(t => values.includes(t)) ? trip.eventId : null })} />
        <fieldset><legend>{en.destinations}</legend><div className="place-grid">
          {destinations.map((place, index) => {
            const checked = trip.destinationIds.includes(place.id)
            return <label className="place-card" key={place.id}>
              <span aria-hidden="true" className={'motif motif-' + place.id}>{motifs[index]}</span>
              <strong>{en[place.id]}</strong><small>{place.themes.map(t => en[t]).join(' · ')}</small>
              <span className="check-line"><input type="checkbox" checked={checked} onChange={() =>
                update({ destinationIds: checked ? trip.destinationIds.filter(id => id !== place.id) : [...trip.destinationIds, place.id] })} />
                {checked ? en.selected : en.select}</span>
            </label>
          })}
        </div></fieldset>
        <MapView places={mapPlaces} originIds={originIds} selectedIds={[trip.originId, ...trip.destinationIds]} labels={en} />
        <label className="return"><input type="checkbox" checked={trip.returnToOrigin}
          onChange={e => update({ returnToOrigin: e.target.checked })} />{en.returnTrip}</label>
        {error && <p role="alert">{en.invalid}</p>}<div className="actions"><button>{en.next}</button></div>
      </form>
    </section>}
    {screen === 'events' && <section className="planner">
      <button className="back" onClick={() => setScreen('planner')}>← {en.back}</button>
      <small className="step">2 / 3</small><h1>{en.events}</h1>
      {matches ? <article className="event">
        {performance.demoOnly && <strong className="demo">{en.demo}</strong>}
        <h2>{en.eventName}</h2>
        <p>{en.venue}<br />{performance.startTime}–{performance.endTime} · {en[performance.setting]}<br />
          {performance.themes.map(theme => en[theme]).join(', ')}</p>
        <p>{en.fictional}</p>
        <div className="actions"><button onClick={() => finish(performance.id)}>{en.add}</button>
          <button className="secondary" onClick={() => finish(null)}>{en.skip}</button></div>
      </article> : <><p>{en.empty}</p><button onClick={() => finish(null)}>{en.next}</button></>}
    </section>}
    {screen === 'summary' && <section className="planner">
      <button className="back" onClick={() => setScreen('events')}>← {en.back}</button>
      <small className="step">3 / 3</small><h1>{en.journey}</h1>
      <JourneyResult trip={trip} labels={en} edit={() => setScreen('planner')} />
    </section>}
    <InstallHint labels={en} visible={screen === 'welcome'} />
  </main>
}



