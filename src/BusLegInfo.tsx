import { useEffect, useState } from 'react'
import type { BusPage } from './liveData'
import type { Messages } from './i18n'

// City route numbers can be ambiguous. Resolve a unique exact match before querying its vehicles.
export function BusLegInfo({ line, labels }: { line:string; labels:Messages }) {
  const [open,setOpen]=useState(false)
  const [result,setResult]=useState<{data?:BusPage;error?:string}>({})
  useEffect(()=>{
    if (!open) return
    const controller=new AbortController()
    async function lookup(action:string,q:string):Promise<BusPage> {
      const res=await fetch('/api/bus?'+new URLSearchParams({action,q}),{signal:controller.signal})
      const body=await res.json()
      if(!res.ok) throw new Error(['apiKey','apiLimit','apiAuth'].includes(body.error)?body.error:'apiFailed')
      return body
    }
    async function load(){
      setResult({})
      const routes=await lookup('routes',line)
      const matches=routes.items.filter(r=>r.id && r.name.trim()===line)
      if(routes.more || matches.length!==1) throw new Error('apiEmpty')
      const data=await lookup('positions',matches[0].id)
      if(!controller.signal.aborted) setResult({data})
    }
    void load().catch(e=>{if(!controller.signal.aborted) setResult({error:e instanceof Error && ['apiKey','apiLimit','apiAuth','apiEmpty'].includes(e.message)?e.message:'apiFailed'})})
    return ()=>controller.abort()
  },[line,open])
  return <span><button type="button" className="secondary" aria-expanded={open} onClick={()=>setOpen(!open)}>{labels.vehicleLocation} · {line}</button>
    {open && <span role="status">{result.data ? <>{result.data.items.map(p=>p.stop).filter(Boolean).join(' · ') || labels.apiEmpty}
      {' · '}{new Date(result.data.fetchedAt).toLocaleTimeString(document.documentElement.lang)}</> : labels[result.error ?? 'loadingApi']}</span>}</span>
}
