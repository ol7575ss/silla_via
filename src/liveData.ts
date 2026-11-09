export interface ForecastHour {
  fcstDate: string
  fcstTime: string
  POP: number | null
  PCP: string | null
  PTY: number | null
  SKY: number | null
  TMP: number | null
}

export interface Forecast {
  source: string
  fetchedAt: string
  baseDate: string
  baseTime: string
  hours: ForecastHour[]
}

export interface BusStop {
  id: string
  name: string
  latitude: number | null
  longitude: number | null
}

export interface BusArrivals {
  source: string
  fetchedAt: string
  arrivals: { stop: BusStop; route: string; seconds: number }[]
}
