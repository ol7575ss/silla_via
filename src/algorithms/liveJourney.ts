import { destinations, origins } from '../tripData'
import type { Place, Theme, TripPreferences } from '../tripData'
import type { TourKind, TourPage, TourPlace } from '../tourData'
import type { RouteMode, RouteSummary } from '../routing'
import type { TravelLeg } from '../travelTimes'
import type { Forecast } from '../liveData'
import { forecastHours, rainOverlap } from '../weatherPolicy'
import { optimizeRoute } from './optimizeRoute'

export type Stop = Place & { tour?: TourPlace; category?: TourKind; hoursText?: string; staySource: 'local-estimate' }
type Point = Pick<Place, 'latitude' | 'longitude'>
const kinds: Record<string,TourKind> = {12:'attractions',14:'culture',15:'festivals',39:'dining',32:'lodging'}
const policies = { attractions:45, culture:60, festivals:60, dining:50, lodging:30 }
const interests: Record<string,[TourKind,string,Theme]> = {
  historyStyle:['attractions','유적','history'], cafeStyle:['dining','카페','food'], foodStyle:['dining','','food'],
  natureStyle:['attractions','숲','nature'], experienceStyle:['culture','','art'], photoStyle:['attractions','전망','photography'],
  familyStyle:['culture','박물관','art'],
}
function convert(p:TourPlace, themes:Theme[]=[]): Stop {
  const category = kinds[p.contentType]
  return {id:'tour-'+p.externalContentId,name:p.name,latitude:p.latitude,longitude:p.longitude,
    themes,setting:'unknown',estimatedStayMinutes:policies[category],staySource:'local-estimate',
    source:p.sourceUrl,tour:p,category}
}
function coord(p:Point) { return p.latitude !== null && p.longitude !== null }
function interval(text:string) {
  const m = /^\s*((?:[01]\d|2[0-3]):[0-5]\d)\s*[~～–-]\s*((?:[01]\d|2[0-3]):[0-5]\d)\s*$/.exec(text)
  return m && m[1]<m[2] ? {open:m[1],close:m[2]} : undefined
}
const errors = new Set(['apiAuth','apiKey','apiLimit','routeQuota','tourQuota','missing','routeEmpty'])
async function read<T>(path:string,signal:AbortSignal):Promise<T> {
  try {
    const r = await fetch(path,{signal})
    const body = await r.json()
    if (!r.ok) throw new Error(errors.has(body.error) ? body.error : 'apiFailed')
    return body as T
  } catch(e) {
    if (signal.aborted) throw e
    throw new Error(e instanceof Error && errors.has(e.message) ? e.message : 'apiFailed')
  }
}
export interface Input {
  trip:TripPreferences; date:string; finalId:string; hotel:TourPlace|null; saved:TourPlace[]; event:TourPlace|null; styles:string[]
}
export async function prepare(input:Input,mode:RouteMode,signal:AbortSignal) {
  const {trip,hotel,event,saved,finalId} = input
  const notices = new Set<string>()
  const locals:Stop[] = [...origins,...destinations].map(p=>({...p,staySource:'local-estimate'}))
  const points = new Map<string,Stop>(locals.map(p=>[p.id,p]))
  if (hotel) points.set('tour-'+hotel.externalContentId,convert(hotel))
  const required = [...new Set([...trip.destinationIds,...saved.map(p=>'tour-'+p.externalContentId)])]
  const stops = new Map<string,Stop>()
  for (const id of trip.destinationIds) if (points.has(id)) stops.set(id,points.get(id)!)
  for (const p of saved) stops.set('tour-'+p.externalContentId,convert(p))
  const weather = read<Forecast>('/api/weather',signal).catch(()=>null)
  if (required.length<3) {
    const queries = input.styles.map(k=>interests[k]).filter(Boolean)
    const pages = await Promise.all(queries.map(async ([kind,q,theme])=>{
      try {
        const page = await read<TourPage>('/api/tour?'+new URLSearchParams({kind,q,page:'1'}),signal)
        return page.items.filter(p=>coord(p) && 'tour-'+p.externalContentId !== trip.originId).map(p=>convert(p,[theme]))
      } catch(e) { if(signal.aborted) throw e; notices.add((e as Error).message); return [] }
    }))
    for (let i=0;i<12 && stops.size<3;i++) for (const page of pages) {
      const p=page[i]
      if (p && stops.size<3 && !stops.has(p.id)) stops.set(p.id,p)
    }
    if (!stops.size && !notices.size) notices.add('noMatches')
  }
  const forecast=await weather
  if (forecastHours(forecast,input.date).length && stops.size<4 && !required.length) {
    const outdoor=locals.find(p=>p.setting==='outdoor' && p.id!==trip.originId &&
      p.themes.some(theme=>trip.themes.includes(theme)) && ![...stops.values()].some(s=>s.latitude===p.latitude && s.longitude===p.longitude))
    if(outdoor) stops.set(outdoor.id,outdoor)
  }
  // Reserve a known indoor alternative for a later forecast update without new route lookups.
  const shelter=locals.find(p=>p.id==='museum' && p.setting==='indoor')
  if(shelter && stops.size<5 && shelter.id!==trip.originId && !stops.has(shelter.id) &&
      !saved.some(p=>p.latitude===shelter.latitude && p.longitude===shelter.longitude)) stops.set(shelter.id,shelter)
  const eventStop = event ? convert(event) : null
  if (eventStop) stops.set(eventStop.id,eventStop)
  let slot = {id:'',startTime:'',endTime:''}
  let conflict = ''
  if (required.length>5) conflict='limit'
  if (event && !(event.start<=input.date.replaceAll('-','') && input.date.replaceAll('-','')<=event.end)) conflict='eventTime'
  if (!conflict) await Promise.all([...stops.values()].map(async p=>{
    if (!p.tour) return
    try {
      const info=await read<{hours:string;closed:string}>('/api/tour?'+new URLSearchParams({kind:p.category!,id:p.tour.externalContentId,intro:'1'}),signal)
      p.hoursText=[info.hours,info.closed].filter(Boolean).join(' · ')
      const window=interval(info.hours)
      if (p.id===eventStop?.id && window) {
        slot={id:p.id,startTime:window.open,endTime:window.close}
        if(window.open<trip.startTime || window.close>trip.endTime) conflict='eventTime'
      } else if (window && !info.closed) p.openingHours=window
    } catch(e) { if(signal.aborted) throw e; notices.add((e as Error).message) }
  }))
  for (const p of stops.values()) points.set(p.id,p)
  const origin=points.get(trip.originId), final=points.get(finalId)
  if(!origin || (finalId && !final)) throw new Error('missing')
  const legs:TravelLeg[]=[]
  const routes=new Map<string,RouteSummary>()
  const issues=new Map<string,string>()
  const visits=[...stops.values()]
  if (!conflict && visits.length) {
    const pairs=new Map<string,[Stop,Stop]>()
    for(const a of [origin,...visits]) for(const b of [...visits,...(final?[final]:[])]) {
      if(a.id===b.id) continue
      const key=a.id+'/'+b.id
      if(coord(a) && coord(b)) pairs.set(key,[a,b])
      else issues.set(key,'missing')
    }
    // At most five required stops and one event. Stop issuing requests on provider-wide failures.
    for(const [key,[a,b]] of pairs) {
      const params=new URLSearchParams({from:a.id,to:b.id,mode,fromX:String(a.longitude),fromY:String(a.latitude),toX:String(b.longitude),toY:String(b.latitude)})
      try {
        let r:RouteSummary
        try {
          r=await read<RouteSummary>('/api/routing?'+params,signal)
        } catch(error) {
          if(signal.aborted || mode!=='PUBLIC_TRANSIT' || !(error instanceof Error) || error.message!=='routeEmpty') throw error
          params.set('mode','WALK')
          r=await read<RouteSummary>('/api/routing?'+params,signal)
        }
        if (!(r.seconds>0)) { issues.set(key,'routeEmpty'); continue }
        routes.set(key,r)
        const walks=r.steps.filter(s=>s.type==='WALKING')
        const walkingMeters=r.mode==='WALK' ? r.meters : walks.length && walks.every(s=>s.meters!==null)
          ? walks.reduce((sum,s)=>sum+s.meters!,0) : null
        legs.push({fromPlaceId:a.id,toPlaceId:b.id,mode:r.mode,durationMinutes:Math.ceil(r.seconds/60),distanceMeters:r.meters,
          walkingMeters,transfers:r.transfers,source:r.source,demoOnly:false})
      } catch(e) {
        if(signal.aborted) throw e
        const reason=(e as Error).message
        issues.set(key,reason); notices.add(reason)
        if(['apiKey','apiAuth','apiLimit','routeQuota'].includes(reason)) break
      }
    }
  }
  if ([origin,...visits,...(final?[final]:[])].some(p=>!coord(p))) notices.add('missing')
  if(eventStop && !slot.id) notices.add('timeUnknown')
  return {forecast,date:input.date,origin,final,visits,required,slot,eventStop,legs,routes,issues,conflict,notices:[...notices]}
}
export type Prepared = Awaited<ReturnType<typeof prepare>>
export function calculate(data:Prepared, trip:TripPreferences, done:string[]=[], start=trip.startTime, rain=false, forecast=data.forecast) {
  const event=data.eventStop
  if(!coord(data.origin) || (data.final && !coord(data.final)) || !data.visits.length) return null
  if(data.conflict || (event && !data.slot.id && !done.includes(event.id))) return null
  const hours=forecastHours(forecast,data.date)
  const minutes=(value:string)=>Number(value.slice(0,2))*60+Number(value.slice(3))
  const wet=rainOverlap(hours,minutes(start),minutes(trip.endTime))>0
  const candidates=data.visits.filter(p=>p.id!=='museum' || data.required.includes(p.id) || wet ||
    p.themes.some(theme=>trip.themes.includes(theme)))
  const places=candidates.filter(p=>p.id!==event?.id && !done.includes(p.id))
  const prefs={...trip,originId:done.at(-1) ?? trip.originId,startTime:start,finalPlaceId:data.final?.id,
    destinationIds:data.required.filter(id=>!done.includes(id)),eventId:event && !done.includes(event.id) ? event.id:null}
  return optimizeRoute(prefs,places,data.slot,data.legs,rain ? {returnPlaceId:trip.originId}:undefined,true,hours)
}
