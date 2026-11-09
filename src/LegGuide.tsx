import { useEffect, useState } from 'react'
import type { Messages } from './i18n'
import type { RouteStep, RouteSummary } from './routing'
import { BusLegInfo } from './BusLegInfo'

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

function Access({route,walk,t,lookup}:{route:RouteSummary;walk:AccessWalk;t:Messages;lookup:boolean}) {
  const [result,setResult]=useState<Estimate|null>(null)
  const [error,setError]=useState('')
  const {start,end}=walk
  const x=start?.[0],y=start?.[1],u=end?.[0],v=end?.[1]
  useEffect(()=>{
    let stale=false
    if(lookup && x!=null && y!=null && u!=null && v!=null) {
      walkingEstimate(route,[x,y],[u,v]).then(r=>{if(!stale)setResult(r)}).catch(e=>{
        if(!stale)setError(['routeQuota','apiKey','apiAuth','routeEmpty'].includes(e.message)?e.message:'apiFailed')
      })
    }
    return ()=>{stale=true}
  },[route,x,y,u,v,lookup])
  return <>{t.walk} · {walk.from} → {walk.to}<br/>{result ? Math.ceil(result.seconds/60)+' '+t.unit+' · '+result.meters+' m' :
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

export function LegGuide({route,from,to,window,t,highlight}:{route:RouteSummary;from:Location;to:Location;window?:string;
  t:Messages;highlight:()=>void;scheduled:boolean}) {
  const [open,setOpen]=useState(false)
  let rides=0, walks=0
  return <details className="leg-guide" open={open} onToggle={e=>setOpen(e.currentTarget.open)}>
    <summary onClick={highlight}>{from.name} → {to.name} · {Math.ceil(route.seconds/60)} {t.unit} · {route.meters} m {window}</summary>
    {open && <><button type="button" className="secondary" onClick={highlight}>{t.map} · {from.name} → {to.name}</button><br/><small>{t[route.mode==='WALK'?'walk':'transit']}{route.transfers!==null && <> · {t.transfers} {route.transfers}</>}</small>
      <ol>{segments(route,from,to,t).map((item,i)=>{
        if('walk' in item) return <li key={i}><Access walk={item.walk} route={route} t={t} lookup={++walks<=4}/></li>
        const s=item.step, isRide=ride(s)
        const transfer=isRide && rides++>0
        return <li key={i}>
          {transfer && <strong>{t.transfers} · {s.board ?? t.unknownValue}<br/></strong>}
          {isRide && <>{t.wait} · {t.unknownValue}<br/>{t.board} · {s.board ?? t.unknownValue}<br/></>}
          {t[s.type==='BUS'?'bus':s.type==='SUBWAY'?'metro':s.type==='WALKING'?'walk':'unknownValue']} {s.vehicles.join(' / ')}
          {s.seconds!==null && <> · {Math.ceil(s.seconds/60)} {t.unit}</>}{s.meters!==null && <> · {s.meters} m</>}
          {isRide && <><br/>{t.alight} · {s.alight ?? t.unknownValue}</>}
          {s.type==='WALKING' && (s.board || s.alight) && <small> {[s.board,s.alight].filter(Boolean).join(' → ')}</small>}
          {s.guidance && <small lang="ko"> {s.guidance}</small>}
          {s.type==='BUS' && s.vehicles.map(line=><BusLegInfo key={line} line={line} labels={t}/>)}
        </li>
      })}</ol>
      {!route.steps.length && <small>{t.unknownLeg}</small>}
      <small>{route.mode==='PUBLIC_TRANSIT' && <>{t.stepTimingNote}<br/></>}{route.landingUrl ? <a href={route.landingUrl} target="_blank" rel="noreferrer">{t.openKakao}</a>:route.source}
        {' · '}{new Date(route.fetchedAt).toLocaleString(document.documentElement.lang)}
        {route.mode==='PUBLIC_TRANSIT' && <> · <a href="https://livebus.gyeongju.go.kr/" target="_blank" rel="noreferrer">경주 LIVE BUS</a></>}</small></>}
  </details>
}
