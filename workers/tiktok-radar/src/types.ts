export type WatchTier = 'A' | 'B' | 'C'

export type WatchAccount = {
  id: string
  username: string
  display_name: string | null
  watch_tier: WatchTier
  monitor_live: boolean
  monitor_video_comments: boolean
  country_code: string | null
  city: string | null
  market_scope: string | null
  is_active: boolean
}

export type NormalizedComment = {
  externalId: string
  username: string
  displayName?: string | null
  userId?: string | null
  text: string
  createdAt: string
  sourceType: 'live' | 'video_comment'
  sourceAccount: string
  sourceContentId?: string | null
  sourceUrl?: string | null
  metadata?: Record<string, unknown>
}

export type VideoRef = {
  id: string
  url?: string | null
  createdAt?: string | null
}

export interface TikTokRadarProvider {
  name: string
  isLive(username: string): Promise<boolean>
  readLiveComments(username: string, since?: string | null): Promise<NormalizedComment[]>
  listRecentVideos(username: string, limit: number): Promise<VideoRef[]>
  readVideoComments(username: string, video: VideoRef, since?: string | null): Promise<NormalizedComment[]>
}
