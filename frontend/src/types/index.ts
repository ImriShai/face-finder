export type SearchMode = 'union' | 'intersection'

export interface SearchMatch {
  photo_id: string
  confidence: number
}

export interface SearchResponse {
  matches: SearchMatch[]
  faces_detected?: number
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
