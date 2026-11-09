import { useEffect, useState } from 'react'
import { BusPanel } from './BusPanel'
import type { Forecast } from './liveData'
import type { Language, Messages } from './i18n'

const errors = ['apiKey', 'apiFailed', 'apiAuth', 'apiEmpty', 'apiLimit']
function useLiveData<T>(path: string, refresh: number) {
  const [result, setResult] = useState<{ data?: T; error?: string }>({})
  useEffect(() => {
    const controller = new AbortController()
    setResult({})
    async function load() {
      try {
        const response = await fetch(path, { signal: controller.signal, headers: { Accept: 'application/json' } })
        const body = await response.json()
        if (!controller.signal.aborted) setResult(response.ok ? { data: body } :
          { error: errors.includes(body.error) ? body.error : 'apiFailed' })
      } catch { if (!controller.signal.aborted) setResult({ error: 'apiFailed' }) }
    }
    void load()
    return () => controller.abort()
  }, [path, refresh])
  return result
}

export function LivePanel({ labels, language, start, end, date, onRisk }: {
  labels: Messages; language: Language; start: string; end: string; date: string; onRisk: (value: boolean) => void
}) {
  const [refresh, setRefresh] = useState(0)
  const weather = useLiveData<Forecast>('/api/weather', refresh)
  const now = new Date(Date.now() + 9 * 3600000).toISOString()
  const today = now.slice(0,10).replaceAll('-', '')
  const hour = now.slice(11,13) + '00'
  const times = weather.data?.hours.filter(h => h.fcstDate === date.replaceAll('-', '') && h.fcstDate + h.fcstTime >= today + hour) ?? []
  const risk = times.some(h => h.fcstTime < end.replace(':','') &&
    Number(h.fcstTime) + 100 > Number(start.replace(':','')) && ((h.POP ?? 0) > 0 || (h.PTY ?? 0) > 0))
  useEffect(() => { onRisk(risk); return () => onRisk(false) }, [onRisk, risk])
  const stamp = (value: string) => new Date(value).toLocaleString(language, { timeZone: 'Asia/Seoul' }) + ' KST'
  function amount(raw: string | null) {
    if (!raw) return '—'
    if (raw === '강수없음') return '0 mm'
    if (!/\d/.test(raw)) return '—'
    return raw.replace('미만', '').replace('이상', '').trim().replace(/^/, raw.includes('미만') ? '< ' : raw.includes('이상') ? '≥ ' : '')
  }
  const types = ['nonePty','rain','mixedPty','snowPty','showerPty']
  return <section className="weather-panel">
    <h2>{labels.forecast}</h2>
    {weather.data ? <>
      <p><a href={weather.data.source}>KMA</a> · {stamp(weather.data.fetchedAt)}</p>
      {risk && <p>{labels.riskNotice}</p>}
      {!times.length && <p>{labels.forecastRange}</p>}<details><summary>{labels.hourly}</summary>
        {times.map(h => <p key={h.fcstDate + h.fcstTime}>
          <strong>{h.fcstDate.slice(0,4)}-{h.fcstDate.slice(4,6)}-{h.fcstDate.slice(6)} {h.fcstTime.slice(0,2)}:00 KST</strong><br />
          {h.TMP ?? '—'} °C · {labels.prob} {h.POP ?? '—'}% · {h.PTY !== null ? labels[types[h.PTY]] ?? '—' : '—'} · {amount(h.PCP)} · {labels.skyLabel} {h.SKY === 1 ? '☀' : h.SKY === 3 ? '🌤' : h.SKY === 4 ? '☁' : '—'}
        </p>)}
        <p>— · {labels.unknownValue}</p>
      </details></> : <p role="status">{weather.error ? labels.loadProblem : labels.loadingApi}</p>}
    <button type="button" className="secondary" onClick={() => setRefresh(n => n + 1)}>{labels.retryTravel}</button>
    {import.meta.env.DEV && new URLSearchParams(location.search).has('tools') && <details><summary>{labels.busStops}</summary><BusPanel labels={labels} /></details>}
  </section>
}

