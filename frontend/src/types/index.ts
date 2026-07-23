export type SearchMode = 'union' | 'intersection'

export interface SearchMatch {
  photo_id: string
  confidence: number
  taken_at?: string | null
}

export interface SearchResponse {
  matches: SearchMatch[]
  faces_detected?: number
}

export interface EventDef {
  label: string
  /** ISO datetime the event starts at. */
  starts_at: string
}

export interface LandingConfig {
  title: string | null
  has_video: boolean
}

export interface Photo {
  id: string
  filename: string
  created_at: string
}

export interface PhotoListResponse {
  total: number
  page: number
  page_size: number
  photos: Photo[]
}
