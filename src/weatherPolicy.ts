import type { Forecast, ForecastHour } from './liveData'

export const weatherPolicy = { rainProbability: 60, refreshMinutes: 10 }

export function forecastHours(forecast:Forecast | null, date:string) {
  return forecast?.hours.filter(h=>h.fcstDate===date.replaceAll('-','')) ?? []
}

function hasRain(h:ForecastHour) {
  return (h.PTY ?? 0)>0 || (h.POP ?? 0)>=weatherPolicy.rainProbability ||
    (h.PCP!==null && /\d/.test(h.PCP) && Number.parseFloat(h.PCP)>0)
}

export function rainOverlap(hours:ForecastHour[], start:number, end:number) {
  let minutes=0
  for(const h of hours) {
    const hour=Number(h.fcstTime.slice(0,2))*60+Number(h.fcstTime.slice(2))
    if(hasRain(h)) minutes+=Math.max(0,Math.min(end,hour+60)-Math.max(start,hour))
  }
  return minutes
}
