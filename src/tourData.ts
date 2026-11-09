export type TourKind = 'attractions' | 'culture' | 'festivals' | 'dining' | 'lodging'
export interface TourPlace {
  source: 'TOUR_API'
  externalContentId: string
  contentType: string
  name: string
  address: string
  latitude: number | null
  longitude: number | null
  imageUrl: string | null
  license: string
  description: string
  start: string
  end: string
  sourceUrl: string
  lastFetchedAt: string
}
export interface TourPage { items: TourPlace[]; more: boolean; fetchedAt: string }
