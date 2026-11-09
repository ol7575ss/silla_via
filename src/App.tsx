import { useState } from 'react'
import { en } from './en'
import { destinations, origins, performance, themeNames } from './tripData'
import type { Theme, TripPreferences } from './tripData'
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

const themes = (Object.keys(themeNames) as Theme[]).map(id => ({ id, name: themeNames[id] }))

export default function App() {
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
    <header><strong>{en.brand}</strong><span>{en.location}</span></header>
    {screen === 'welcome' && <section className="welcome">
      <div className="landscape" aria-hidden="true"><i /></div>
      <div className="copy"><h1>{en.title}</h1><p>{en.intro}</p>
        <button onClick={() => setScreen('planner')}>{en.start} <span aria-hidden="true">→</span></button>
      </div>
    </section>}
    {screen === 'planner' && <section className="planner">
      <button className="back" onClick={() => setScreen('welcome')}>← {en.back}</button>
      <h1>{en.planner}</h1>
      <form onSubmit={e => { e.preventDefault(); setScreen('events') }}>
        <label>{en.origin}<select required value={trip.originId} onChange={e => update({ originId: e.target.value })}>
          <option value="">{en.placeholder}</option>
          {origins.map(place => <option key={place.id} value={place.id}>{place.name}</option>)}
        </select></label>
        <div className="times">
          <label>{en.from}<input required type="time" value={trip.startTime} onChange={e => update({ startTime: e.target.value })} /></label>
          <label>{en.until}<input required type="time" value={trip.endTime} onChange={e => update({ endTime: e.target.value })} /></label>
        </div>
        <Choices title={en.interests} options={themes} selected={trip.themes} onChange={values =>
          update({ themes: values, eventId: performance.themes.some(t => values.includes(t)) ? trip.eventId : null })} />
        <Choices title={en.destinations} options={destinations} selected={trip.destinationIds}
          onChange={destinationIds => update({ destinationIds })} />
        <label className="return"><input type="checkbox" checked={trip.returnToOrigin}
          onChange={e => update({ returnToOrigin: e.target.checked })} />{en.returnTrip}</label>
        <div className="actions"><button>{en.next}</button></div>
      </form>
    </section>}
    {screen === 'events' && <section className="planner">
      <button className="back" onClick={() => setScreen('planner')}>← {en.back}</button>
      <h1>{en.events}</h1>
      {matches ? <article className="event">
        {performance.demoOnly && <strong className="demo">{en.demo}</strong>}
        <h2>{performance.name}</h2>
        <p>{performance.location}<br />{performance.startTime}–{performance.endTime} · {en[performance.setting]}<br />
          {performance.themes.map(theme => themeNames[theme]).join(', ')}</p>
        <p>{en.fictional}</p>
        <div className="actions"><button onClick={() => finish(performance.id)}>{en.add}</button>
          <button className="secondary" onClick={() => finish(null)}>{en.skip}</button></div>
      </article> : <><p>{en.empty}</p><button onClick={() => finish(null)}>{en.next}</button></>}
    </section>}
    {screen === 'summary' && <section className="planner">
      <button className="back" onClick={() => setScreen('events')}>← {en.back}</button>
      <h1>{en.summary}</h1>
      <p>{origins.find(place => place.id === trip.originId)?.name}<br />{trip.startTime}–{trip.endTime}</p>
      <ul>{destinations.filter(place => trip.destinationIds.includes(place.id)).map(place => <li key={place.id}>{place.name}</li>)}</ul>
      {trip.eventId === performance.id ? <p><strong>{en.event}</strong><br />{performance.name} ({en.demo})</p> : <p>{en.noEvent}</p>}
    </section>}
  </main>
}
