export const themeNames = {
  history: 'History & Culture', nature: 'Nature & Walking', food: 'Food & Cafe',
  art: 'Art & Museum', photography: 'Photography',
}
export type Theme = keyof typeof themeNames
type Setting = 'indoor' | 'outdoor'

interface Place {
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

function place(id: string, name: string, themes: Theme[], setting: Setting, estimatedStayMinutes: number): Place {
  return { id, name, themes, setting, estimatedStayMinutes, latitude: null, longitude: null,
    source: 'Developer-defined demo data; coordinates unverified.' }
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
  returnToOrigin: boolean
  eventId: string | null
}
