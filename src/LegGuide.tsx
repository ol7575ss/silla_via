import { useCallback, useEffect, useState } from 'react'
import type { Messages } from './i18n'
import type { RouteStep, RouteSummary } from './routing'
import type { BusSelection } from './transitStops'
function duration(seconds:number){
  const lang=document.documentElement.lang
  const unit=(n:number,u:string)=>new Intl.NumberFormat(lang,{style:'unit',unit:u,unitDisplay:'short'}).format(n)
  return [Math.floor(seconds/60)>0 && unit(Math.floor(seconds/60),'minute'),(seconds%60>0 || seconds===0) && unit(seconds%60,'second')].filter(Boolean).join(' ')
}

type Location = {name:string;longitude:number|null;latitude:number|null}
type Coords = [number,number]
interface AccessWalk {from:string;to:string;start?:Coords;end?:Coords}
type Segment = {walk:AccessWalk} | {step:RouteStep}
type Estimate = Pick<RouteSummary,'seconds'|'meters'>
const estimates = new WeakMap<RouteSummary,Map<string,Promise<Estimate>>>()

function walkingEstimate(route:RouteSummary,start:Coords,end:Coords) {
  let cache=estimates.get(route)
  if (!cache) {cache=new Map();estimates.set(route,cache)}
  const key=[...start,...end].join(',')
  const cached=cache.get(key)
  if(cached) return cached
  const params=new URLSearchParams({from:'access-start',to:'access-end',mode:'WALK',
    fromX:String(start[0]),fromY:String(start[1]),toX:String(end[0]),toY:String(end[1])})
  const request=fetch('/api/routing?'+params).then(async response=>{
    const data=await response.json()
    if(!response.ok) throw new Error(data.error)
    return {seconds:data.seconds,meters:data.meters} as Estimate
  })
  cache.set(key,request)
  return request
}

function Access({route,walk,t,lookup,onMeters,index}:{route:RouteSummary;walk:AccessWalk;t:Messages;lookup:boolean;index:number;onMeters:(i:number,m:number)=>void}) {
  const [result,setResult]=useState<Estimate|null>(null)
  const [error,setError]=useState('')
  const {start,end}=walk
  const x=start?.[0],y=start?.[1],u=end?.[0],v=end?.[1]
  useEffect(()=>{
    let stale=false
    if(lookup && x!=null && y!=null && u!=null && v!=null) {
      walkingEstimate(route,[x,y],[u,v]).then(r=>{if(!stale){setResult(r);onMeters(index,r.meters)}}).catch(e=>{
        if(!stale)setError(['routeQuota','apiKey','apiAuth','routeEmpty'].includes(e.message)?e.message:'apiFailed')
      })
    }
    return ()=>{stale=true}
  },[route,x,y,u,v,lookup,index,onMeters])
  return <>{t.walk} · {walk.from} → {walk.to}<br/>{result ? duration(result.seconds)+' · '+result.meters+' m' :
    t[error || (lookup && start && end ? 'loadingApi':'unknownValue')]}</>
}

function coords(p:Location):Coords|undefined {
  if(p.longitude!==null && p.latitude!==null)return [p.longitude,p.latitude]
}
function ride(s:RouteStep) {return s.type==='BUS'||s.type==='SUBWAY'}
function segments(route:RouteSummary,from:Location,to:Location,t:Messages) {
  const items:Segment[]=[]
  for(const [i,s] of route.steps.entries()) {
    const prev=route.steps[i-1]
    if(ride(s) && (!prev || ride(prev))) {
      const start=prev ? prev.points.at(-1):coords(from)
      const end=s.points[0]
      if(!start || !end || start[0]!==end[0] || start[1]!==end[1])
        items.push({walk:{from:prev ? prev.alight ?? t.unknownValue : from.name,to:s.board ?? t.unknownValue,start,end}})
    }
    items.push({step:s})
    if(i===route.steps.length-1 && ride(s)) {
      const start=s.points.at(-1),end=coords(to)
      if(!start || !end || start[0]!==end[0] || start[1]!==end[1])
        items.push({walk:{from:s.alight ?? t.unknownValue,to:to.name,start,end}})
    }
  }
  return items
}

export function LegGuide({route,from,to,window,t,highlight,selectBus,selectionKey}:{route:RouteSummary;from:Location;to:Location;window?:string;
  t:Messages;highlight:()=>void;scheduled:boolean;selectBus:(value:BusSelection|null)=>void;selectionKey?:string}) {
  const [open,setOpen]=useState(false)
  const [accessMeters,setMeters]=useState<Record<number,number>>({})
  const onMeters=useCallback((i:number,m:number)=>setMeters(prev=>prev[i]===m?prev:{...prev,[i]:m}),[])
  const items=segments(route,from,to,t)
  const walking=items.flatMap((item,i)=>'walk' in item?[accessMeters[i] ?? null]:item.step.type==='WALKING'?[item.step.meters]:[])
  const totalWalk=route.mode==='WALK'?route.meters:!items.length || walking.some(m=>m===null)?null:walking.reduce<number>((sum,m)=>sum+(m ?? 0),0)
  const lines=[...new Set(route.steps.filter(s=>s.type==='BUS').flatMap(s=>s.vehicles))]
  const legId=route.from+'/'+route.to+'/'
  function choose(i:number,line:string,s:RouteStep){selectBus({key:legId+i+'/'+line,line,step:s})}
  let rides=0, walks=0
  return <details className="leg-guide" open={open} onToggle={e=>setOpen(e.currentTarget.open)}>
    <summary onClick={()=>{
      highlight()
      if(open){selectBus(null);return}
      const i=route.steps.findIndex(s=>s.type==='BUS' && s.vehicles.length)
      if(i>=0)choose(i,route.steps[i].vehicles[0],route.steps[i])
      else selectBus(null)
    }}><strong>{from.name} → {to.name}</strong> · {duration(route.seconds)} {window}
      <span className="transport-summary">{lines.map(line=><b className="line-badge" key={line}>{t.bus} {line}</b>)}
      {route.transfers!==null && <span>{t.transfers} {route.transfers}</span>}<span>{t.walk} · {totalWalk===null?t.unknownValue:totalWalk+' m'}</span></span></summary>
    {open && <><button type="button" className="secondary" onClick={highlight}>{t.map} · {from.name} → {to.name}</button><br/><small>{t[route.mode==='WALK'?'walk':'transit']}{route.transfers!==null && <> · {t.transfers} {route.transfers}</>}</small>
      <ol>{items.map((item,i)=>{
        if('walk' in item) return <li key={i}><Access index={i} onMeters={onMeters} walk={item.walk} route={route} t={t} lookup={++walks<=4}/></li>
        const s=item.step, isRide=ride(s)
        const transfer=isRide && rides++>0
        return <li key={i}>
          {transfer && <strong>{t.transfers} · {s.board ?? t.unknownValue}<br/></strong>}
          {isRide && <><b className="line-badge">{t[s.type==='BUS'?'bus':'metro']} {s.vehicles.join(' / ') || t.unknownValue}</b><br/><strong>{t.board} · {s.board ?? t.unknownValue}</strong><br/></>}
          {t[s.type==='BUS'?'bus':s.type==='SUBWAY'?'metro':s.type==='WALKING'?'walk':'unknownValue']} 
          {s.seconds!==null && <> · {duration(s.seconds)}</>}{s.meters!==null && <> · {s.meters} m</>}
          {isRide && <><br/>{t.alight} · {s.alight ?? t.unknownValue}</>}
          {s.type==='WALKING' && (s.board || s.alight) && <small> {[s.board,s.alight].filter(Boolean).join(' → ')}</small>}
          {s.guidance && <small lang="ko"> {s.guidance}</small>}
          {s.type==='BUS' && s.vehicles.map(line=><button type="button" key={line} className="line-badge" aria-pressed={selectionKey===legId+i+'/'+line} onClick={()=>choose(i,line,s)}>{t.map} · {line}</button>)}
        </li>
      })}<li>{to.name} · {t.arrival}</li></ol>
      {!route.steps.length && <small>{t.unknownLeg}</small>}
      <small>{route.mode==='PUBLIC_TRANSIT' && <>{t.stepTimingNote}<br/></>}{route.landingUrl ? <a href={route.landingUrl} target="_blank" rel="noreferrer">{t.openKakao}</a>:route.source}
        {' · '}{new Date(route.fetchedAt).toLocaleString(document.documentElement.lang)}
        {route.mode==='PUBLIC_TRANSIT' && <> · <a href="https://livebus.gyeongju.go.kr/" target="_blank" rel="noreferrer">경주 LIVE BUS</a></>}</small></>}
  </details>
}
