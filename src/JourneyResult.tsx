import { useMemo } from 'react'
import { optimizeRoute } from './algorithms/optimizeRoute'
import { demoTravelLegs } from './travelTimes'
import { destinations, origins, performance } from './tripData'
import type { TripPreferences } from './tripData'
import type { Messages } from './i18n'
import { MapView } from './MapView'

function clock(minutes: number) {
  return [Math.floor(minutes / 60), minutes % 60].map(n => String(n).padStart(2, '0')).join(':')
}

export function JourneyResult({ trip, labels, edit }: { trip: TripPreferences; labels: Messages; edit: () => void }) {
  const result = useMemo(() => optimizeRoute(trip, destinations, performance, demoTravelLegs), [trip])
  const name = (id: string) => id === performance.id ? labels.eventName : labels[id]
  const duration = (n: number) => n + ' ' + labels.unit
  if (!result.ok) return <div>
    <p role="alert">{labels[result.reason]}</p>
    {result.gaps.length > 0 && <ul>{result.gaps.map(([from, to]) =>
      <li key={from + '/' + to}>{name(from)} → {name(to)}</li>)}</ul>}
    <button onClick={edit}>{labels.editTrip}</button>
  </div>
  const route = result.journey
  const order = Object.fromEntries(route.visits.map(v => [v.placeId, v.order]))
  const places = [...origins.filter(p => p.id === trip.originId), ...destinations.filter(p => p.id in order)]
  return <>
    <p><strong>{name(trip.originId)}</strong><br />{trip.startTime}–{trip.endTime}</p>
    <ol className="timeline">{route.visits.map(v => <li key={v.placeId}>
      <small>{labels[v.leg.mode === 'BUS' ? 'bus' : 'walk']} · {duration(v.leg.durationMinutes)}</small>
      <h2>{name(v.placeId)}</h2>
      <div>{labels.arrival} {clock(v.arrival)} · {labels.depart} {clock(v.departure)}</div>
      {v.wait > 0 && <div>{labels.wait} {duration(v.wait)} ({clock(v.arrival)}–{clock(v.arrival + v.wait)})</div>}
      {v.isEvent && <div>{labels.venue} · {performance.startTime}–{performance.endTime} ({labels.demo})</div>}
      <div>{labels.stay} {duration(v.stay)}</div>
      {v.hoursUnknown && <small>{labels.unknownHours}</small>}
    </li>)}</ol>
    <p>{route.returnLeg && route.returnTime !== null ? <>
      {labels.returnAt} · {clock(route.returnTime)}<br />
      {labels[route.returnLeg.mode === 'BUS' ? 'bus' : 'walk']} · {duration(route.returnLeg.durationMinutes)}
    </> : labels.noReturn}</p>
    <p>{labels.totalTravel} · {duration(route.travel)}<br />{labels.totalStay} · {duration(route.sightseeing)}<br />
      {labels.finishTime} · {clock(route.finish)}</p>
    {route.demoOnly && <p className="demo">{labels.demoTravel}</p>}
    <MapView places={places} selectedIds={[]} originIds={[trip.originId]} visitOrder={order} labels={labels} />
    <button onClick={edit}>{labels.editTrip}</button>
  </>
}
