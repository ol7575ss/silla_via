import { useEffect, useRef, useState } from 'react'
import { Map as LibreMap, Marker, NavigationControl, LngLatBounds, setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Messages } from './i18n'
import type { Place } from './tripData'

setWorkerUrl(workerUrl)

interface MapProps {
  places: (Pick<Place, 'id' | 'name' | 'latitude' | 'longitude'> & Partial<Pick<Place, 'themes'>>)[]
  onPlaceClick?: (id: string) => void
  selectedIds: string[]
  finalId?: string
  originIds: string[]
  statuses?: Record<string, string>
  currentId?: string
  visitOrder?: Record<string, number>
  labels: Messages
}

export function MapView({ places, selectedIds, originIds, visitOrder, statuses, currentId, labels, onPlaceClick, finalId }: MapProps) {
  const container = useRef<HTMLDivElement>(null)
  const [instance, setInstance] = useState<LibreMap | null>(null)
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  const [activeId, setActiveId] = useState('')
  const active = places.find(p => p.id === activeId)

  useEffect(() => {
    const host = container.current
    if (!host) return
    let map: LibreMap | undefined
    let timeout: number
    let stopped = false
    let ready = false
    let reported = false
    setPhase('loading')
    function fail(reason: string) {
      if (stopped || reported) return
      reported = true
      console.warn('[Silla Via / MapLibre]', reason)
      setPhase('error')
    }
    function resize() {
      if (stopped || !host || !host.clientWidth || !host.clientHeight) return
      if (map) { map.resize(); return }
      if (reported) return
      try {
        map = new LibreMap({
          container: host, center: [129.219, 35.835], zoom: 12,
          style: 'https://tiles.openfreemap.org/styles/liberty',
        })
        map.on('error', ({ error }) => {
          if (ready) return
          const message = error.message ?? ''
          const category = /worker/i.test(message) ? 'worker' : /webgl/i.test(message) ? 'WebGL' : 'style or resource'
          const status = /\b[45]\d\d\b/.exec(message)?.[0] ?? ''
          fail(category + ' load failed ' + status)
        })
        map.on('load', () => {
          if (stopped) return
          ready = true
          window.clearTimeout(timeout)
          setPhase('ready')
        })
        map.addControl(new NavigationControl({ showCompass: false }))
        setInstance(map)
        timeout = window.setTimeout(() => fail('initial load timed out'), 30000)
      } catch {
        fail('map initialization failed; check WebGL support')
      }
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    return () => {
      stopped = true
      observer.disconnect()
      window.clearTimeout(timeout)
      map?.remove()
      setInstance(null)
    }
  }, [attempt])

  useEffect(() => {
    if (!instance) return
    const host = instance.getContainer()
    instance.getCanvas().setAttribute('aria-label', labels.map)
    for (const [selector, title] of [
      ['.maplibregl-ctrl-zoom-in', labels.zoomIn], ['.maplibregl-ctrl-zoom-out', labels.zoomOut],
      ['.maplibregl-ctrl-attrib-button', labels.attribution],
    ]) {
      const control = host.querySelector(selector)
      control?.setAttribute('title', title)
      control?.setAttribute('aria-label', title)
    }
  }, [instance, labels])

  const located = places.filter(p => p.longitude !== null && p.latitude !== null)
  const selected = located.filter(p => selectedIds.includes(p.id))
  const bounds = new LngLatBounds()
  for (const p of selected.length ? selected : located) bounds.extend([p.longitude!, p.latitude!])
  const frame = bounds.isEmpty() ? '' : bounds.toArray().flat().join(',')
  useEffect(() => {
    if (!instance || !frame) return
    const [west, south, east, north] = frame.split(',').map(Number)
    instance.fitBounds([[west, south], [east, north]], { padding: 40, maxZoom: 15, duration: 0 })
  }, [instance, frame])

  useEffect(() => {
    if (!instance) return
    const markers: Marker[] = []
    for (const p of places) {
      if (p.latitude === null || p.longitude === null) continue
      const selected = selectedIds.includes(p.id)
      const origin = originIds.includes(p.id)
      const name = labels[p.id] ?? p.name
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'place-pin' + (selected ? ' chosen' : '') + (origin ? ' origin-pin' : '') + (p.id === finalId ? ' final-pin' : '')
      button.textContent = [origin ? '⚑' : '',visitOrder?.[p.id],p.id === finalId ? '⚐' : ''].filter(Boolean).join('') || (selected ? '✓' : '●')
      const busKind=p.id.startsWith('reported-')?'reported':p.id.startsWith('stop-board')?'board':p.id.startsWith('stop-alight')?'alight':null
      if(busKind){button.classList.add('transport-pin',busKind);button.textContent=busKind==='reported'?'▣':busKind==='board'?'↑':'↓'}
      const label=busKind ? labels[busKind==='reported'?'reportedStop':busKind]+' · '+name : name
      button.title = selected ? label + ' · ' + labels.selected : label
      const status = statuses?.[p.id]
      if (status) {
        button.classList.add(status)
        button.title += ' · ' + labels[status]
      }
      if (p.id === currentId) {
        button.classList.add('current-pin')
        button.title += ' · ' + labels.current
      }
      button.setAttribute('aria-label', button.title)
      button.onclick = () => { setActiveId(p.id); onPlaceClick?.(p.id) }
      markers.push(new Marker({ element: button, offset: busKind==='reported' ? [0,-19] : [0,0] }).setLngLat([p.longitude, p.latitude]).addTo(instance))
    }
    return () => markers.forEach(marker => marker.remove())
  }, [instance, places, selectedIds, originIds, visitOrder, statuses, currentId, labels, onPlaceClick, finalId])

  return <section className="map-panel">
    <h2>{labels.map}</h2>
    <div className="map-canvas" ref={container} />
    {phase === 'loading' && <p role="status">{labels.mapLoading}</p>}
    {phase === 'error' && <div role="status"><p>{labels.mapError}</p>
      <button type="button" onClick={() => setAttempt(n => n + 1)}>{labels.mapRetry}</button></div>}
    {active && <p aria-live="polite"><strong>{labels[active.id] ?? active.name}</strong>
      {' · '}{[originIds.includes(active.id) && labels.origin,active.id===finalId && labels.endPlace,active.themes?.map(t => labels[t]).join(' · ')].filter(Boolean).join(' · ')}
      {statuses?.[active.id] && ' · ' + labels[statuses[active.id]]}{active.id === currentId && ' · ' + labels.current}
      {selectedIds.includes(active.id) && ' · ' + labels.selected}</p>}
  </section>
}





