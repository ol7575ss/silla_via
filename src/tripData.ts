export const themeNames = {
  history: 'History & Culture', nature: 'Nature & Walking', food: 'Food & Cafe',
  art: 'Art & Museum', photography: 'Photography',
}
export type Theme = keyof typeof themeNames
type Setting = 'indoor' | 'outdoor' | 'unknown'

export interface Place {
  id: string
  name: string
  latitude: number | null
  longitude: number | null
  themes: Theme[]
  setting: Setting
  estimatedStayMinutes: number
  openingHours?: { open: string; close: string }
  source: string
}

type Location = { latitude: number; longitude: number; source: string }
const locations: Partial<Record<string, Location>> = {
  cheomseongdae: { latitude: 35.834722, longitude: 129.219, source: 'https://en.wikipedia.org/wiki/Cheomseongdae' },
  daereungwon: { latitude: 35.838, longitude: 129.212, source: 'https://en.wikipedia.org/wiki/Daereungwon' },
  hwangnidan: { latitude: 35.8375, longitude: 129.2097, source: 'https://en.wikipedia.org/wiki/Hwangnidan-gil' },
  donggung: { latitude: 35.83470, longitude: 129.22644, source: 'https://kr.geoview.info/gyeongju_donggunggwa_wolji%2C477417220w' },
  museum: { latitude: 35.8289833, longitude: 129.228361, source: 'https://en.wikipedia.org/wiki/Gyeongju_National_Museum' },
  bulguksa: { latitude: 35.790215, longitude: 129.332059, source: 'https://buddhaland.dongguk.edu/article?dataId=KBA0002625' },
  seokguram: { latitude: 35.796264, longitude: 129.349950, source: 'https://buddhaland.dongguk.edu/article?dataId=KBA0002625' },
  bomun: { latitude: 35.84363, longitude: 129.28702, source: 'https://mapcarta.com/N12908974229' },
  station: { latitude: 35.79833, longitude: 129.13889, source: 'https://en.wikipedia.org/wiki/Gyeongju_station' },
}
function place(id: string, name: string, themes: Theme[], setting: Setting, estimatedStayMinutes: number): Place {
  return { id, name, themes, setting, estimatedStayMinutes, latitude: null, longitude: null,
    source: 'Developer-defined demo data; coordinates unverified.', ...locations[id] }
}

export const destinations = [
  place('cheomseongdae', 'Cheomseongdae', ['history', 'photography'], 'outdoor', 30),
  place('daereungwon', 'Daereungwon', ['history', 'nature'], 'outdoor', 60),
  place('hwangnidan', 'Hwangnidan-gil', ['food', 'photography'], 'outdoor', 60),
  place('donggung', 'Donggung Palace and Wolji Pond', ['history', 'photography'], 'outdoor', 50),
  place('museum', 'Gyeongju National Museum', ['history', 'art'], 'indoor', 90),
  place('bulguksa', 'Bulguksa Temple', ['history', 'photography'], 'outdoor', 75),
  place('seokguram', 'Seokguram Grotto', ['history', 'nature'], 'outdoor', 60),
  place('bomun', 'Bomun Tourist Complex', ['nature', 'photography'], 'outdoor', 60),
]

export const origins = [
  place('station', 'Gyeongju Station', [], 'indoor', 0),
  place('hwangnidan-stay', 'Demo hotel near Hwangnidan-gil', [], 'indoor', 0),
  place('bomun-stay', 'Demo hotel near Bomun Tourist Complex', [], 'indoor', 0),
]

export const performance = {
  id: 'traditional-performance', name: 'Gyeongju Traditional Culture Performance',
  location: 'Demo venue near Cheomseongdae', startTime: '14:00', endTime: '14:40',
  themes: ['history'] as Theme[], setting: 'outdoor', demoOnly: true,
} as const

export interface TripPreferences {
  originId: string
  startTime: string
  endTime: string
  themes: Theme[]
  destinationIds: string[]
  finalPlaceId?: string
  returnToOrigin: boolean
  eventId: string | null
}


