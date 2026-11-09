import { useEffect, useMemo, useState } from 'react'
import { BusLegInfo } from './BusLegInfo'
import { MapView } from './MapView'
import type { Messages } from './i18n'
import type { RouteMode } from './routing'
import { prepare, calculate } from './algorithms/liveJourney'
import type { Input, Prepared, Stop } from './algorithms/liveJourney'
import { clock } from './algorithms/replanRemainingRoute'
import type { Journey, Visit } from './algorithms/optimizeRoute'

export function LiveJourney({trip,date,finalId,hotel,saved,event,styles,labels:t,risk,edit}:Input & {labels:Messages;risk:boolean;edit:()=>void}) {
  const [mode,setMode]=useState<RouteMode>('WALK')
  const [attempt,retry]=useState(0)
  const [data,setData]=useState<Prepared|null>(null)
  const [problem,setProblem]=useState('')
  const [active,focus]=useState('')
  const [revised,setRevised]=useState<Journey|null>(null)
  const [done,setDone]=useState<Visit[]>([])
  const [currentTime,setTime]=useState(trip.startTime)
  const [kept,keep]=useState(false)
  useEffect(()=>{
    const controller=new AbortController()
    setData(null);setProblem('');setDone([]);setRevised(null);keep(false);focus('');setTime(trip.startTime)
    void prepare({trip,date,finalId,hotel,saved,event,styles},mode,controller.signal).then(result=>{
      if(!controller.signal.aborted) setData(result)
    }).catch(()=>{if(!controller.signal.aborted) setProblem('apiFailed')})
    return ()=>controller.abort()
  },[trip,date,finalId,hotel,saved,event,styles,mode,attempt])
  const calculated=useMemo(()=>data ? calculate(data,trip) : null,[data,trip])
  const controls=<div className="actions"><label>{t.routeMode}<select disabled={done.length>0} value={mode} onChange={e=>setMode(e.target.value as RouteMode)}>
    <option value="WALK">{t.walk}</option><option value="PUBLIC_TRANSIT">{t.transit}</option></select></label>
    <button className="secondary" disabled={done.length>0} onClick={()=>retry(n=>n+1)}>{t.retryTravel}</button></div>
  if(!data) return <>{controls}<p role="status">{t[problem || 'loadingApi']}</p></>
  const initial=calculated
  const original=initial?.ok ? initial.journey:null
  const journey=revised ?? original
  const byId=new Map(data.visits.map(p=>[p.id,p]))
  const visits=journey ? journey.visits.map(v=>byId.get(v.placeId)!) : data.visits
  const name=(p:Stop)=>t[p.id] ?? p.name
  const order=journey ? Object.fromEntries(visits.map((p,i)=>[p.id,i+1])) : undefined
  const issue=data.conflict || (initial && !initial.ok ? initial.reason : '')
  const duration=(n:number)=>n+' '+t.unit
  const mapPoints=[...new Map([data.origin,...visits,...(data.final?[data.final]:[])].map(p=>[p.id,p])).values()]
  function leg(from:string,to:string) {
    if (from===to) return null
    const key=from+'/'+to
    const r=data!.routes.get(key)
    if (!r) return <small>{t[data!.issues.get(key) ?? 'unknownLeg']}</small>
    return <small>{t[r.mode==='WALK'?'walk':'transit']} · {duration(Math.ceil(r.seconds/60))} · {r.meters} m
      {r.transfers!==null && <> · {t.transfers} {r.transfers}</>}
      {r.steps.filter(s=>s.vehicles.length || s.board || s.alight).map((s,i)=><span key={i}><br/>{[s.vehicles.join(', '),s.board,s.alight].filter(Boolean).join(' · ')}</span>)}
      {[...new Set(r.steps.filter(s=>s.type==='BUS').flatMap(s=>s.vehicles))].map(line=><BusLegInfo key={key+'/'+line} line={line} labels={t}/>)}
      <br/>{r.landingUrl ? <a href={r.landingUrl} target="_blank" rel="noreferrer">{t.openKakao}</a> : r.source} · <time dateTime={r.fetchedAt}>{new Date(r.fetchedAt).toLocaleString(document.documentElement.lang)}</time></small>
  }
  function replan() {
    const earliest=done.length ? clock(done[done.length-1].departure) : trip.startTime
    if(!currentTime || currentTime<earliest || currentTime>=trip.endTime) {setProblem('timeRange');return}
    const next=calculate(data!,trip,done.map(v=>v.placeId),currentTime,true)
    if(!next?.ok) {setProblem(next && !next.ok ? next.reason:'unknownLeg');return}
    setProblem('')
    setRevised({...next.journey,travel:next.journey.travel+done.reduce((n,v)=>n+v.leg.durationMinutes,0),
      sightseeing:next.journey.sightseeing+done.reduce((n,v)=>n+v.stay,0),visits:[...done,...next.journey.visits].map((v,i)=>({...v,order:i+1}))})
  }
  return <>{controls}
    {mode==='PUBLIC_TRANSIT' && <p>{t.transitSnapshot}</p>}
    {data.notices.map(key=><p role="status" key={key}>{t[key]}</p>)}
    {issue && <p role="alert">{t[issue==='missingLeg'?'unknownLeg':issue]}</p>}
    {!journey && visits.length>0 && <><p>{t.untimedPlaces}</p>
      <details><summary>{t.routeMode}</summary>{visits.map(p=><p key={p.id}>{name(data.origin)} → {name(p)}<br/>{leg(data.origin.id,p.id)}</p>)}
        {data.final && visits.filter(p=>p.id!==data.final?.id).map(p=><p key={p.id}>{name(p)} → {name(data.final!)}<br/>{leg(p.id,data.final!.id)}</p>)}</details></>}
    <MapView places={mapPoints} selectedIds={active?[active]:[]} onPlaceClick={focus} originIds={[trip.originId]} visitOrder={order} labels={t}/>
    <p>{t.origin} · {name(data.origin)} · {trip.startTime}</p>
    <ol className="timeline">{visits.map((p,i)=>{
      const v=journey?.visits[i]
      const fixed=p.id===data.slot.id
      return <li key={p.id} className={active===p.id?'highlight':undefined}>
        <small>{t[p.id===data.eventStop?.id?'event':data.required.includes(p.id)?'mustStop':'suggestedStop']}</small>
        <h2><button onClick={()=>focus(p.id)} aria-pressed={active===p.id}>{name(p)}</button></h2>
        {p.tour?.imageUrl && <figure><img src={p.tour.imageUrl} alt=""/><figcaption>한국관광공사 · KOGL {p.tour.license}</figcaption></figure>}
        {p.tour && <small>{p.tour.address} · <a href={p.source}>한국관광공사</a></small>}
        {p.tour?.description && <p lang="ko">{p.tour.description}</p>}
        {p.latitude===null || p.longitude===null ? <p>{t.missing}</p>:null}
        {p.hoursText && <p>{p.hoursText}</p>}
        {!fixed && <small>{p.openingHours ? p.openingHours.open+'–'+p.openingHours.close : t.unknownHours}</small>}
        {fixed ? <p>{data.slot.startTime}–{data.slot.endTime}</p> : p.id!==data.eventStop?.id && <p>{t.stayEstimate} · {duration(p.estimatedStayMinutes)}</p>}
        {v && <><p>{t.arrival} {clock(v.arrival)} · {t.depart} {clock(v.departure)}{v.wait>0 && <> · {t.wait} {duration(v.wait)}</>}</p>{leg(v.leg.fromPlaceId,p.id)}
          {i<done.length ? <p>{t.completed}</p> : i===done.length && <button className="secondary" onClick={()=>{setDone([...done,v]);setTime(clock(v.departure))}}>{t.completed}</button>}</>}
      </li>
    })}</ol>
    {data.final && <p>{t.endPlace} · {name(data.final)} {journey && clock(journey.finish)}<br/>
      {journey?.returnLeg && leg(journey.returnLeg.fromPlaceId,data.final.id)}</p>}
    {journey && <p>{t.finishTime} · {clock(journey.finish)}</p>}
    {risk && journey && !kept && <section className="weather-panel"><p>{t.rainPrompt}</p>
      <label>{t.current} · {done.length ? name(byId.get(done[done.length-1].placeId)!) : name(data.origin)}<input type="time" value={currentTime} onChange={e=>setTime(e.target.value)}/></label>
      <button onClick={replan}>{t.replanJourney}</button><button className="secondary" onClick={()=>keep(true)}>{t.keepJourney}</button></section>}
    {revised && original && <details><summary>{t.original}</summary>{original.visits.map(v=><p key={v.placeId}>{name(byId.get(v.placeId)!)} · {clock(v.arrival)}–{clock(v.departure)}</p>)}</details>}
    {problem && <p role="alert">{t[problem]}</p>}
    <button onClick={edit}>{t.editTrip}</button></>
}
