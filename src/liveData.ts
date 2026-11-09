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

export interface BusItem {
  id: string
  name: string
  start?: string
  end?: string
  stop?: string
  seconds?: number
}
export interface BusPage {
  items: BusItem[]
  fetchedAt: string
  more: boolean
}
