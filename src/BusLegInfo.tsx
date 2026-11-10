import { useEffect,useRef,useState } from 'react'
import type { BusPage } from './liveData'
import type { Messages } from './i18n'
import { matchStation,stations } from './transitStops'
import type { BusSelection, TransitPin } from './transitStops'

export function BusLegInfo({selection,labels:t,onPins}:{selection:BusSelection;labels:Messages;onPins:(pins:TransitPin[])=>void}) {
  const {line,step}=selection
  const [attempt,setAttempt]=useState(0)
  const [busy,setBusy]=useState(false)
  const [status,setStatus]=useState('')
  const [direction,setDirection]=useState('')
  const [stamp,setStamp]=useState('')
  const [records,setRecords]=useState<string[]>([])
  const [unmatched,setUnmatched]=useState(false)
  const lock=useRef(false)
  useEffect(()=>{
    const controller=new AbortController()
    const signal=controller.signal
    const publish=(pins:TransitPin[])=>{if(!signal.aborted)onPins(pins)}
    async function lookup(action:string,q:string):Promise<BusPage> {
      const r=await fetch('/api/bus?'+new URLSearchParams({action,q}),{signal})
      const body=await r.json()
      if(!r.ok) throw new Error(['apiLimit','apiKey','apiAuth','busBusy'].includes(body.error)?body.error:'apiFailed')
      return body
    }
    async function load(){
      const rows=await stations()
      if(signal.aborted)return
      const board=matchStation(rows,step.board,step.points[0])
      const alight=matchStation(rows,step.alight,step.points.at(-1))
      const pins:TransitPin[]=[]
      for(const [kind,s] of [['board',board],['alight',alight]] as const){
        if(s)pins.push({kind,id:'stop-'+kind+s[0],name:s[1],latitude:s[2],longitude:s[3]})
      }
      publish(pins)
      setUnmatched(!board || !alight)
      if(!attempt)return
      setStatus('');setStamp('');setRecords([]);setDirection('')
      const routes=await lookup('routes',line)
      const exact=routes.items.filter(r=>r.id && r.name.trim()===line)
      // A matching line number alone does not establish which way the vehicle travels.
      const directional=exact.filter(r=>r.start && r.end && r.start!==r.end &&
        (r.start===step.board || r.end===step.alight) && r.start!==step.alight && r.end!==step.board)
      if(routes.more || directional.length!==1)throw new Error('busLineUnconfirmed')
      if(signal.aborted)return
      setDirection(directional[0].start+' → '+directional[0].end)
      const positions=await lookup('positions',directional[0].id)
      if(signal.aborted)return
      setStamp(positions.fetchedAt)
      const located=new Set<string>()
      const names=new Set<string>()
      for(const item of positions.items){
        if(item.name!==line || !item.stop || !item.id) continue
        names.add(item.stop)
        const s=rows.find(s=>(s[0]===item.id || s[0]==='KUB'+item.id) && s[1]===item.stop)
        if(!s || located.has(s[0]))continue
        located.add(s[0])
        pins.push({id:'reported-'+s[0],kind:'reported',name:line+' · '+s[1],latitude:s[2],longitude:s[3]})
      }
      publish([...pins]);setRecords([...names])
      setStatus(!positions.items.length?'apiEmpty':located.size?'reportedStop':'missing')
    }
    void load().catch(e=>{if(!signal.aborted)setStatus(e instanceof Error && ['apiAuth','apiLimit','apiKey','busLineUnconfirmed','busBusy'].includes(e.message)?e.message:'apiFailed')})
      .finally(()=>{if(!signal.aborted){setBusy(false);lock.current=false}})
    return ()=>{controller.abort();onPins([])}
  },[line,step,onPins,attempt])
  return <section className="bus-service"><strong className="line-badge">{t.bus} {line}</strong> {step.board ?? '—'} → {step.alight ?? '—'}
    {direction && <small>{t.bus} {line} · {direction}</small>}
    {unmatched && <small>{t.missing}</small>}
    <button className="secondary" disabled={busy} onClick={()=>{if(lock.current)return;lock.current=true;setBusy(true);setAttempt(n=>n+1)}}>{attempt?t.retryTravel:t.vehicleLocation}</button>
    <small role="status">{busy?t.loadingApi:status && t[status]} {records.join(' · ')}</small>
    {stamp && <small>{t.lookupTime} · {new Date(stamp).toLocaleString(document.documentElement.lang)}</small>}
    <small>{t.busEtaUnknown} · <a href="https://livebus.gyeongju.go.kr/" target="_blank" rel="noreferrer">경주 LIVE BUS</a></small>
  </section>
}
