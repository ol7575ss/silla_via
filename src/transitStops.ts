import type { RouteStep } from './routing'
export type Station = [id:string,name:string,latitude:number,longitude:number]
export type TransitPin = {id:string;name:string;latitude:number;longitude:number;kind:'board'|'alight'|'reported'}
export type BusSelection = {key:string;line:string;step:RouteStep}
let catalog:Promise<Station[]>|undefined
export function stations() {
  return catalog ??= fetch('/gyeongju-stops.json').then(async r=>{
    if(!r.ok) throw new Error('apiFailed')
    return (await r.json()).stops as Station[]
  }).catch(e=>{catalog=undefined;throw e})
}
export function matchStation(rows:Station[],name:string|null,point?:[number,number]) {
  if(!name || !point) return
  // The endpoint guides identity matching only. Pin coordinates always come from the public stop catalog.
  const distance=(s:Station)=>Math.hypot((s[2]-point[1])*111200,(s[3]-point[0])*90000)
  const near=rows.filter(s=>s[1]===name && distance(s)<=45).sort((a,b)=>distance(a)-distance(b))
  if(near.length && (!near[1] || distance(near[1])-distance(near[0])>=8)) return near[0]
}
