import { useEffect, useMemo, useState } from 'react'
import { LegGuide } from './LegGuide'
import { MapView } from './MapView'
import type { Messages } from './i18n'
import type { Forecast } from './liveData'
import { forecastHours, rainOverlap, weatherPolicy } from './weatherPolicy'
import { prepare, calculate } from './algorithms/liveJourney'
import type { Input, Prepared, Stop } from './algorithms/liveJourney'
import { clock } from './algorithms/replanRemainingRoute'
import type { Journey, Visit } from './algorithms/optimizeRoute'

export function LiveJourney({trip,date,finalId,hotel,saved,event,styles,labels:t,edit}:Input & {labels:Messages;edit:()=>void}) {
  const mode='PUBLIC_TRANSIT' as const
  const [latest,setLatest]=useState<Forecast|null>(null)
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
    setData(null);setLatest(null);setProblem('');setDone([]);setRevised(null);keep(false);focus('');setTime(trip.startTime)
    void prepare({trip,date,finalId,hotel,saved,event,styles},mode,controller.signal).then(result=>{
      if(!controller.signal.aborted) setData(result)
    }).catch(e=>{if(!controller.signal.aborted) setProblem(e instanceof Error && e.message==='missing' ? 'missing':'apiFailed')})
    return ()=>controller.abort()
  },[trip,date,finalId,hotel,saved,event,styles,mode,attempt])
  const calculated=useMemo(()=>data ? calculate(data,trip) : null,[data,trip])
  useEffect(()=>{
    if(!data) return
    const controller=new AbortController()
    let busy=false
    async function refresh(){
      if(busy || document.hidden) return
      busy=true
      try {
        const response=await fetch('/api/weather',{signal:controller.signal})
        if(response.ok) {
          const next:Forecast=await response.json()
          if(!controller.signal.aborted) setLatest(prev=>{
            const previous=prev ?? data!.forecast
            return previous && previous.baseDate+previous.baseTime >= next.baseDate+next.baseTime ? prev : next
          })
        }
      } catch { /* Keep the last available forecast. */ }
      finally {busy=false}
    }
    const timer=window.setInterval(refresh,weatherPolicy.refreshMinutes*60000)
    document.addEventListener('visibilitychange',refresh)
    return ()=>{controller.abort();window.clearInterval(timer);document.removeEventListener('visibilitychange',refresh)}
  },[data])
  useEffect(()=>{keep(false)},[latest])
  const controls=problem || data && !calculated?.ok ? <button className="secondary" onClick={()=>retry(n=>n+1)}>{t.retryTravel}</button> : null
  if(!data) return <>{controls}<p role="status">{t[problem || 'loadingApi']}</p>{problem && <button onClick={edit}>{t.editTrip}</button>}</>
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
  function leg(from:string,to:string,arrival?:number) {
    if (from===to) return null
    const key=from+'/'+to
    const r=data!.routes.get(key)
    if (!r) {
      const points=[data!.origin,...data!.visits,...(data!.final?[data!.final]:[])]
      const start=points.find(p=>p.id===from), end=points.find(p=>p.id===to)
      return <small>{start && name(start)} → {end && name(end)} · {t[data!.issues.get(key) ?? 'unknownLeg']}</small>
    }
    const origin=mapPoints.find(p=>p.id===from), destination=mapPoints.find(p=>p.id===to)
    if(!origin || !destination) return null
    const window=arrival===undefined ? undefined : clock(arrival-Math.ceil(r.seconds/60))+'–'+clock(arrival)
    return <LegGuide key={key} route={r} from={{...origin,name:name(origin)}} to={{...destination,name:name(destination)}}
      scheduled={arrival!==undefined} window={window} t={t} highlight={()=>focus(key)}/>
  }
  const forecast=latest ?? data.forecast
  const hours=forecastHours(forecast,date)
  const now=new Date(Date.now()+9*3600000).toISOString()
  const resume=done.length && now.slice(0,10)===date && now.slice(11,16)>currentTime ? now.slice(11,16) : currentTime
  const remaining=latest && hours.length>0 && journey && !kept ? calculate(data,trip,done.map(v=>v.placeId),resume,true,latest) : null
  const alternative=remaining?.ok ? {...remaining.journey,
    visits:[...done,...remaining.journey.visits].map((v,i)=>({...v,order:i+1})),
    travel:remaining.journey.travel+done.reduce((n,v)=>n+v.leg.durationMinutes,0),
    sightseeing:remaining.journey.sightseeing+done.reduce((n,v)=>n+v.stay,0)} : null
  const changed=alternative && journey && (alternative.finish!==journey.finish || alternative.visits.length!==journey.visits.length ||
    alternative.visits.some((v,i)=>v.placeId!==journey.visits[i]?.placeId || v.arrival!==journey.visits[i]?.arrival))
  return <>{controls}
    {forecast && hours.length>0 ? <small>{t.forecast} · KST {forecast.baseDate} {forecast.baseTime}</small> : <small>{forecast ? t.forecastRange : t.weatherUnavailable}</small>}
    {data.notices.map(key=><p role="status" key={key}>{t[key]}</p>)}
    {issue && <p role="alert">{t[issue==='missingLeg'?'unknownLeg':issue]}</p>}
    {!journey && data.issues.size>0 && <ul>{[...data.issues].map(([key,reason])=><li key={key}>{key.split('/').map(id=>{
      const p=mapPoints.find(point=>point.id===id);return p ? name(p) : id
    }).join(' → ')} · {t[reason]}</li>)}</ul>}
    {!journey && visits.length>0 && <><p>{t.untimedPlaces}</p>
      <details><summary>{t.routeMode}</summary>{visits.map(p=><div key={p.id}>{leg(data.origin.id,p.id)}</div>)}
        {data.final && visits.filter(p=>p.id!==data.final?.id).map(p=><div key={p.id}>{leg(p.id,data.final!.id)}</div>)}</details></>}
    <MapView finalId={finalId} places={mapPoints} selectedIds={active ? active.split('/') : []} onPlaceClick={focus} originIds={[trip.originId]} visitOrder={order} labels={t}/>
    <p className={active===trip.originId ? 'trip-endpoint active' : 'trip-endpoint'}><button onClick={()=>focus(trip.originId)}>{t.origin} · {name(data.origin)} · {trip.startTime}</button></p>
    <ol className="timeline">{visits.map((p,i)=>{
      const v=journey?.visits[i]
      const fixed=p.id===data.slot.id
      return <li key={p.id} className={active===p.id?'highlight':undefined}>
        {v && leg(v.leg.fromPlaceId,p.id,v.arrival)}
        <small>{t[p.id===data.eventStop?.id?'event':data.required.includes(p.id)?'mustStop':'suggestedStop']}</small>
        {v && rainOverlap(hours,v.departure-v.stay,v.departure)>0 && p.setting!=='unknown' && <p>{t[p.setting==='indoor'?'rainShelter':'rainOutdoor']}</p>}
        {!!p.themes.length && <small> · {p.themes.map(k=>t[k]).join(' · ')}</small>}
        <h2><button onClick={()=>focus(p.id)} aria-pressed={active===p.id}>{v && v.order+'. '}{name(p)}</button></h2>
        {p.tour?.imageUrl && <figure><img src={p.tour.imageUrl} alt=""/><figcaption>한국관광공사 · KOGL {p.tour.license}</figcaption></figure>}
        {p.tour && <small>{p.tour.address} · <a href={p.source}>한국관광공사</a></small>}
        {p.tour?.description && <p lang="ko">{p.tour.description}</p>}
        {p.latitude===null || p.longitude===null ? <p>{t.missing}</p>:null}
        {p.hoursText && <p>{p.hoursText}</p>}
        {!fixed && <small>{p.openingHours ? p.openingHours.open+'–'+p.openingHours.close : t.unknownHours}</small>}
        {fixed ? <p>{data.slot.startTime}–{data.slot.endTime}</p> : p.id!==data.eventStop?.id && <p>{t.stayEstimate} · {duration(p.estimatedStayMinutes)}</p>}
        {v && <><p>{t.arrival} {clock(v.arrival)} · {t.depart} {clock(v.departure)}{v.wait>0 && <> · {t.wait} {duration(v.wait)}</>}</p>
          {i<done.length ? <p>{t.completed}</p> : i===done.length && <button className="secondary" onClick={()=>{setDone([...done,v]);setTime(clock(v.departure))}}>{t.completed}</button>}</>}
      </li>
    })}</ol>
    {data.final && <div>{journey?.returnLeg && leg(journey.returnLeg.fromPlaceId,data.final.id,journey.finish)}<button className={active===finalId?'secondary endpoint-active':'secondary'} onClick={()=>focus(finalId)}>{t.endPlace} · {name(data.final)} {journey && clock(journey.finish)}</button></div>}
    {journey && <p>{t.finishTime} · {clock(journey.finish)}</p>}
    {remaining && !remaining.ok && <p role="status">{t[remaining.reason==='missingLeg'?'unknownLeg':remaining.reason]} · {t.unchanged}</p>}
    {changed && alternative && <section><p>{t.weatherAlternative}</p>
      <ol>{alternative.visits.slice(done.length).map(v=><li key={v.placeId}>{name(byId.get(v.placeId)!)} · {clock(v.arrival)}–{clock(v.departure)}</li>)}</ol>
      <button onClick={()=>{setRevised(alternative);keep(true)}}>{t.replanJourney}</button>
      <button className="secondary" onClick={()=>keep(true)}>{t.keepJourney}</button></section>}
    {revised && original && <details><summary>{t.original}</summary>{original.visits.map(v=><p key={v.placeId}>{name(byId.get(v.placeId)!)} · {clock(v.arrival)}–{clock(v.departure)}</p>)}</details>}
    {problem && <p role="alert">{t[problem]}</p>}
    <button onClick={edit}>{t.editTrip}</button></>
}
