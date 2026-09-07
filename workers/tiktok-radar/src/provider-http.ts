import type { NormalizedComment, TikTokRadarProvider, VideoRef } from './types.js'

const req = async <T>(base: string, path: string, token?: string): Promise<T> => {
  const r = await fetch(`${base.replace(/\/$/, '')}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  })
  if (!r.ok) throw new Error(`provider_http_${r.status}`)
  return r.json() as Promise<T>
}

export class HttpTikTokProvider implements TikTokRadarProvider {
  name = 'http-provider'
  constructor(private baseUrl: string, private token?: string) {}

  async isLive(username: string) {
    const data = await req<{ live: boolean }>(this.baseUrl, `/live/status?username=${encodeURIComponent(username)}`, this.token)
    return Boolean(data.live)
  }

  async readLiveComments(username: string, since?: string | null) {
    const qs = new URLSearchParams({ username })
    if (since) qs.set('since', since)
    const data = await req<{ comments: NormalizedComment[] }>(this.baseUrl, `/live/comments?${qs.toString()}`, this.token)
    return data.comments || []
  }

  async listRecentVideos(username: string, limit: number) {
    const data = await req<{ videos: VideoRef[] }>(this.baseUrl, `/videos?username=${encodeURIComponent(username)}&limit=${limit}`, this.token)
    return data.videos || []
  }

  async readVideoComments(username: string, video: VideoRef, since?: string | null) {
    const qs = new URLSearchParams({ username, video_id: video.id })
    if (since) qs.set('since', since)
    const data = await req<{ comments: NormalizedComment[] }>(this.baseUrl, `/video/comments?${qs.toString()}`, this.token)
    return data.comments || []
  }
}
