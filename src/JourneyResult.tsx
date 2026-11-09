import { useMemo, useState } from 'react'
import { optimizeRoute } from './algorithms/optimizeRoute'
import { demoTravelLegs } from './travelTimes'
import { destinations, origins, performance } from './tripData'
import type { TripPreferences } from './tripData'
import type { Messages } from './i18n'
import { MapView } from './MapView'
import type { TourPlace } from './tourData'

import { clock, rainCheckpoint, replanRemainingRoute } from './algorithms/replanRemainingRoute'
import type { Journey, Visit } from './algorithms/optimizeRoute'
export function JourneyResult({ trip: input, finalId, hotel, labels, edit, live, forecastRisk }: { hotel: TourPlace | null; finalId: string; live: boolean; forecastRisk: boolean; trip: TripPreferences; labels: Messages; edit: () => void }) {
  const { trip, result } = useMemo(() => {
    const base = { ...input, finalPlaceId: finalId || undefined, returnToOrigin: finalId === input.originId }
    const calculate = (prefs: TripPreferences) => optimizeRoute(prefs, destinations, performance, demoTravelLegs)
    if (input.destinationIds.length) return { trip: base, result: calculate(base) }
    const affinity = (themes: typeof input.themes) => themes.filter(t => input.themes.includes(t)).length
    const ranked = [...destinations].sort((a,b) => affinity(b.themes) - affinity(a.themes))
    const attempts = ranked.map(p => {
      const trip = { ...base, destinationIds: [p.id] }
      return { trip, result: calculate(trip) }
    })
    return attempts.find(a => a.result.ok) ?? attempts[0]
  }, [input, finalId])
  const [highlight,setHighlight] = useState('')
  const [dismissed,setDismissed] = useState(false)
  const [indoorForecast, setIndoorForecast] = useState<Journey | null>(null)
  const [forecastError, setForecastError] = useState('')
  const [weather, setWeather] = useState<'CLEAR' | 'RAIN'>('CLEAR')
  const [preference, setPreference] = useState<'INDOOR' | 'KEEP_ORIGINAL' | null>(null)
  const [replacement, setReplacement] = useState<Journey | null>(null)
  const [selectedEventId, setSelectedEventId] = useState(trip.eventId)
  const [problem, setProblem] = useState('')
  const [waiver, setWaiver] = useState<string[]>([])
  const name = (id: string) => id === performance.id ? labels.eventName : labels[id]
  const duration = (n: number) => n + ' ' + labels.unit
  const locations = [...origins,...destinations, ...(hotel ? [{ ...hotel, id: 'tour-' + hotel.externalContentId }] : [])]
  if (!result.ok) return <div>
    <p role="alert">{labels[result.reason]}</p>
    <MapView places={locations.filter(p => [trip.originId,finalId,...input.destinationIds].includes(p.id))} selectedIds={input.destinationIds} originIds={[trip.originId]} labels={labels}/>
    {result.gaps.length > 0 && <ul>{result.gaps.map(([from, to]) =>
      <li key={from + '/' + to}>{name(from)} → {name(to)}</li>)}</ul>}
    <button onClick={edit}>{labels.editTrip}</button>
  </div>
  const original = result.journey
  const adjusted = live ? indoorForecast : replacement
  const route = adjusted ?? original
  const raining = !live && weather === 'RAIN'
  const checkpoint = rainCheckpoint(original, trip)
  const completed = raining ? checkpoint.completed.map(v => v.placeId) : []
  const current = raining ? checkpoint.currentPlaceId : trip.originId
  const removed = original.visits.filter(old => !route.visits.some(v => v.placeId === old.placeId))
  const pendingEvent = !!trip.eventId && !completed.includes(trip.eventId)
  function status(v: Visit) {
    if (completed.includes(v.placeId)) return 'completed'
    const old = original.visits.find(stop => stop.placeId === v.placeId)
    if (!old) return 'added'
    if (old.order !== v.order || old.arrival !== v.arrival || old.departure !== v.departure ||
      old.leg.fromPlaceId !== v.leg.fromPlaceId || old.leg.durationMinutes !== v.leg.durationMinutes) return 'changed'
    return 'kept'
  }
  const markerStatus = Object.fromEntries([
    ...removed.map(v => [v.placeId, 'removed']),
    ...route.visits.map(v => [v.placeId, status(v)]),
  ])
  function applyIndoor(allowed: string[] = []) {
    const next = replanRemainingRoute(original, trip, selectedEventId, allowed)
    if (next.ok) {
      setReplacement(next.journey)
      setPreference('INDOOR')
      setProblem('')
      setWaiver([])
      return
    }
    setProblem(next.reason)
    // Seek the smallest feasible set of omissions before requesting consent.
    const pending = trip.destinationIds.filter(id => !completed.includes(id))
    const subsets = pending.reduce<string[][]>((sets, id) => [...sets, ...sets.map(set => [...set, id])], [[]])
    setWaiver(subsets.filter(set => set.length).sort((a, b) => a.length - b.length)
      .find(set => replanRemainingRoute(original, trip, selectedEventId, set).ok) ?? [])
  }
  function resetDemo() {
    setWeather('CLEAR')
    setPreference(null)
    setReplacement(null)
    setSelectedEventId(trip.eventId)
    setProblem('')
    setWaiver([])
  }
  const order = Object.fromEntries(route.visits.map(v => [v.placeId, v.order]))
  const places = locations.filter(p => p.id === trip.originId || p.id === finalId || p.id in order || removed.some(v => v.placeId === p.id))
  return <>
    <div className="journey-stat"><strong>{route.visits.length}</strong> {labels.visitsCount} · {labels.totalStay} {duration(route.sightseeing)}</div>
    {route.demoOnly && <p className="demo">{labels.demoTravel}</p>}
    <MapView places={places} selectedIds={highlight ? [highlight] : []} onPlaceClick={setHighlight} originIds={[trip.originId]} visitOrder={order} statuses={adjusted || raining ? markerStatus : undefined} currentId={raining ? current : undefined} labels={labels} />
    {live && !dismissed && (forecastRisk || indoorForecast) && <section className="weather-panel">
      {forecastRisk && <p>{labels.rainPrompt}</p>}
      {indoorForecast ? <button onClick={() => setIndoorForecast(null)}>{labels.keepRoute}</button> :
        <button onClick={() => {
          const next = optimizeRoute(trip, destinations, performance, demoTravelLegs, { returnPlaceId: trip.originId })
          if (next.ok) { setIndoorForecast(next.journey); setForecastError('') }
          else setForecastError(next.reason)
        }}>{labels.replanJourney}</button>}
      {!indoorForecast && <button className="secondary" onClick={() => setDismissed(true)}>{labels.keepJourney}</button>}
      {forecastError && <p role="alert">{labels[forecastError]}</p>}
    </section>}
    {!live && <section className="weather-panel">
      <strong>{labels[raining ? 'rain' : 'clear']}</strong>
      <p>{raining ? clock(checkpoint.currentTime) : trip.startTime} · {labels.current} · {name(current)}</p>
      {!raining && <button onClick={() => setWeather('RAIN')}>{labels.simulate}</button>}
      {raining && !preference && <>
        <p>{labels.question}</p>
        {pendingEvent && <><p>{labels.outdoorAlert}</p><label className="return"><input type="checkbox"
          checked={!!selectedEventId} onChange={e => { setSelectedEventId(e.target.checked ? trip.eventId : null); setProblem(''); setWaiver([]) }} />
          {labels.keepEvent}</label></>}
        <div className="actions"><button onClick={() => applyIndoor()}>{labels.switchIndoor}</button>
          <button className="secondary" onClick={() => { setPreference('KEEP_ORIGINAL'); setSelectedEventId(trip.eventId); setProblem(''); setWaiver([]) }}>{labels.keepRoute}</button></div>
        {problem && <p role="alert">{labels[problem]} {labels.unchanged}</p>}
        {waiver.length > 0 && <button onClick={() => applyIndoor(waiver)}>{labels.omitRequired} · {waiver.map(name).join(', ')}</button>}
      </>}
      {(preference === 'KEEP_ORIGINAL' || (replacement && !removed.length &&
        route.visits.every(v => ['completed', 'kept'].includes(status(v))) && route.finish === original.finish)) &&
        <p>{labels.unchanged}</p>}
      {raining && <button className="secondary" onClick={resetDemo}>{labels.reset}</button>}
    </section>}
    {adjusted && <details><summary>{labels.original}</summary><ol>{original.visits.map(v =>
      <li key={v.placeId}>{name(v.placeId)} · {clock(v.arrival)}–{clock(v.departure)} · {labels[v.leg.mode === 'BUS' ? 'bus' : 'walk']} {duration(v.leg.durationMinutes)}</li>)}</ol>
      <p>{labels.totalTravel} · {duration(original.travel)} → {duration(route.travel)}</p>
      {original.returnTime !== null && <p>{labels.endPlace} · {name(finalId || trip.originId)} · {clock(original.returnTime)}</p>}</details>}
    {removed.map(v => <p className="route-status removed" key={v.placeId}>{labels.removed} · {name(v.placeId)}</p>)}
    <ol className="timeline">{route.visits.map(v => <li key={v.placeId} className={highlight === v.placeId ? 'highlight' : undefined}>
      <small>{labels[v.leg.mode === 'BUS' ? 'bus' : 'walk']} · {duration(v.leg.durationMinutes)}</small>
      <h2><button aria-pressed={highlight === v.placeId} onClick={() => setHighlight(v.placeId)}>{name(v.placeId)}</button></h2>
      {v.placeId === 'cheomseongdae' && <img src="/cheomseongdae.jpg" alt="" />}
      <small>{labels[v.placeId + 'Intro']}</small>
      {raining && <span className={'route-status ' + status(v)}>{labels[status(v)]}
        {destinations.some(p => p.id === v.placeId && p.setting === 'indoor') && ' · ' + labels.indoor}</span>}
      <div>{labels.arrival} {clock(v.arrival)} · {labels.depart} {clock(v.departure)}</div>
      {v.wait > 0 && <div>{labels.wait} {duration(v.wait)} ({clock(v.arrival)}–{clock(v.arrival + v.wait)})</div>}
      {v.isEvent && <div>{labels.venue} · {performance.startTime}–{performance.endTime} ({labels.demo})</div>}
      <div>{labels.stay} {duration(v.stay)}</div>
      {v.hoursUnknown && <small>{labels.unknownHours}</small>}
    </li>)}</ol>
    <p>{route.returnLeg && route.returnTime !== null ? <>
      {labels.endPlace} · {name(finalId || trip.originId)} · {clock(route.returnTime)}<br />
      {labels[route.returnLeg.mode === 'BUS' ? 'bus' : 'walk']} · {duration(route.returnLeg.durationMinutes)}
    </> : finalId ? name(finalId) : labels.noReturn}</p>
    <p>{labels.totalTravel} · {duration(route.travel)}<br />{labels.totalStay} · {duration(route.sightseeing)}<br />
      {labels.finishTime} · {clock(route.finish)}</p>
    <button onClick={edit}>{labels.editTrip}</button>
  </>
}






