import { useEffect, useRef, useState } from 'react'
import { Map as LibreMap, Marker, NavigationControl, LngLatBounds } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Messages } from './i18n'
import type { Place } from './tripData'

interface MapProps {
  places: Place[]
  selectedIds: string[]
  originIds: string[]
  visitOrder?: Record<string, number>
  labels: Messages
}

export function MapView({ places, selectedIds, originIds, visitOrder, labels }: MapProps) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<LibreMap | null>(null)
  const [failed, setFailed] = useState(false)
  const [activeId, setActiveId] = useState('')
  const active = places.find(p => p.id === activeId)

  useEffect(() => {
    if (!container.current) return
    let instance: LibreMap
    try {
      instance = new LibreMap({
        container: container.current, center: [129.219, 35.835], zoom: 12,
        style: 'https://tiles.openfreemap.org/styles/liberty',
        locale: {
          'Map.Title': labels.map, 'NavigationControl.ZoomIn': labels.zoomIn,
          'NavigationControl.ZoomOut': labels.zoomOut, 'AttributionControl.ToggleAttribution': labels.attribution,
        },
      })
    } catch {
      setFailed(true)
      return
    }
    map.current = instance
    instance.addControl(new NavigationControl({ showCompass: false }))
    const bounds = new LngLatBounds()
    for (const p of places) {
      if (p.longitude !== null && p.latitude !== null) bounds.extend([p.longitude, p.latitude])
    }
    if (!bounds.isEmpty()) instance.fitBounds(bounds, { padding: 46, maxZoom: 15, duration: 0 })
    instance.on('error', () => setFailed(true))
    instance.on('load', () => setFailed(false))
    return () => { instance.remove(); map.current = null }
  }, [places, labels])

  useEffect(() => {
    const instance = map.current
    if (!instance) return
    const markers: Marker[] = []
    for (const p of places) {
      if (p.latitude === null || p.longitude === null) continue
      const selected = selectedIds.includes(p.id)
      const origin = originIds.includes(p.id)
      const name = labels[p.id] ?? p.name
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'place-pin' + (selected ? ' chosen' : '') + (origin ? ' origin-pin' : '')
      button.textContent = visitOrder?.[p.id] ? String(visitOrder[p.id]) : selected ? '✓' : origin ? '⚑' : '●'
      button.title = selected ? name + ' · ' + labels.selected : name
      button.setAttribute('aria-label', button.title)
      button.onclick = () => setActiveId(p.id)
      markers.push(new Marker({ element: button }).setLngLat([p.longitude, p.latitude]).addTo(instance))
    }
    return () => markers.forEach(marker => marker.remove())
  }, [places, selectedIds, originIds, visitOrder, labels])

  return <section className="map-panel">
    <h2>{labels.map}</h2>
    <div className="map-canvas" ref={container} />
    {failed && <p role="status">{labels.mapError}</p>}
    {active && <p aria-live="polite"><strong>{labels[active.id] ?? active.name}</strong>
      {' · '}{originIds.includes(active.id) ? labels.origin : active.themes.map(t => labels[t]).join(' · ')}
      {selectedIds.includes(active.id) && ' · ' + labels.selected}</p>}
  </section>
}

