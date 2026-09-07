import type { NormalizedComment, VideoRef } from './types.js'

type Json = Record<string, any>
export type SocQDiscoveryVideo = {
  username: string
  displayName?: string | null
  caption?: string | null
  videoId?: string | null
  videoUrl?: string | null
  createdAt?: string | null
  followers?: number | null
  views?: number | null
  likes?: number | null
  comments?: number | null
  shares?: number | null
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export class SocQTikTokVideoProvider {
  readonly name = 'socq'
  private base = 'https://api.socq.ai/v1'

  constructor(private apiKey: string, private pollMs = 1500, private timeoutMs = 45_000) {}

  private headers() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    }
  }

  private async json(url: string, init?: RequestInit): Promise<Json> {
    const response = await fetch(url, { ...init, headers: { ...this.headers(), ...(init?.headers || {}) } })
    let body: Json = {}
    try { body = await response.json() as Json } catch { body = {} }
    if (!response.ok) {
      const detail = body?.error?.message || body?.message || body?.error || `http_${response.status}`
      throw new Error(`socq_${response.status}:${String(detail)}`)
    }
    return body
  }

  private taskId(body: Json) {
    return String(body?.data?.task_id || body?.data?.id || body?.task_id || body?.id || '')
  }

  private items(body: Json): any[] {
    const candidates = [
      body?.data?.results?.items,
      body?.data?.items,
      body?.results?.items,
      body?.items,
    ]
    for (const value of candidates) if (Array.isArray(value)) return value
    return []
  }

  private async submit(path: string, payload: Json) {
    const body = await this.json(`${this.base}${path}`, { method: 'POST', body: JSON.stringify(payload) })
    const id = this.taskId(body)
    if (!id) throw new Error('socq_task_id_missing')
    return id
  }

  private async wait(taskId: string) {
    const started = Date.now()
    for (;;) {
      const body = await this.json(`${this.base}/tasks/${encodeURIComponent(taskId)}?limit=100`)
      const status = String(body?.data?.status || body?.status || '').toLowerCase()
      if (['succeeded', 'success', 'completed', 'done'].includes(status)) return body
      if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) {
        throw new Error(`socq_task_${status}:${body?.data?.error?.message || body?.error?.message || body?.message || 'unknown'}`)
      }
      if (Date.now() - started > this.timeoutMs) throw new Error('socq_task_timeout')
      await sleep(this.pollMs)
    }
  }

  private videoId(item: any) {
    return String(item?.id || item?.video_id || item?.post_id || item?.aweme_id || item?.content_id || item?.extra?.video_id || '')
  }

  private creator(item: any) {
    return item?.creator || item?.author || item?.user || item?.owner || {}
  }

  private username(item: any) {
    const creator = this.creator(item)
    return String(
      creator?.username || creator?.unique_id || creator?.uniqueId ||
      item?.author_username || item?.creator_username || item?.username || item?.extra?.author_username || ''
    ).replace(/^@/, '')
  }

  private videoUrl(item: any, username?: string) {
    const explicit = item?.url || item?.video_url || item?.share_url || item?.web_url || item?.source_url || item?.canonical_url || item?.permalink || item?.extra?.url || item?.extra?.video_url || null
    if (explicit) return String(explicit)
    const id = this.videoId(item)
    const creator = this.username(item) || String(username || '').replace(/^@/, '')
    return id && creator ? `https://www.tiktok.com/@${creator}/video/${id}` : null
  }

  async searchPublicVideos(query: string, limit = 20): Promise<SocQDiscoveryVideo[]> {
    const resultsLimit = Math.max(20, Math.min(100, limit))
    let taskId: string
    try {
      taskId = await this.submit('/tiktok/search', {
        query,
        results_limit: resultsLimit,
        sort_by: 'latest',
        published_within: 'month',
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!/socq_400|socq_422/i.test(message)) throw error
      taskId = await this.submit('/tiktok/search', { query, results_limit: resultsLimit })
    }
    const body = await this.wait(taskId)
    const raw = this.items(body)
    const videos = raw.map(item => {
      const creator = this.creator(item)
      const metrics = item?.metrics || item?.stats || item?.statistics || {}
      return {
        username: this.username(item),
        displayName: creator?.display_name || creator?.nickname || item?.author_name || null,
        caption: item?.caption || item?.description || item?.text || item?.title || null,
        videoId: this.videoId(item) || null,
        videoUrl: this.videoUrl(item),
        createdAt: item?.created_at || item?.published_at || item?.timestamp || item?.create_time || null,
        followers: Number(creator?.followers ?? creator?.follower_count ?? item?.author_followers ?? 0) || null,
        views: Number(metrics?.views ?? metrics?.play_count ?? item?.view_count ?? item?.play_count ?? 0) || null,
        likes: Number(metrics?.likes ?? metrics?.digg_count ?? item?.like_count ?? 0) || null,
        comments: Number(metrics?.comments ?? metrics?.comment_count ?? item?.comment_count ?? 0) || null,
        shares: Number(metrics?.shares ?? metrics?.share_count ?? item?.share_count ?? 0) || null,
      }
    }).filter(x => x.username)

    console.log(JSON.stringify({
      event: 'socq_search', query, task_id: taskId,
      raw_items: raw.length, creators: new Set(videos.map(v => v.username)).size,
      version: '0.5.6',
    }))
    return videos
  }

  async listRecentVideos(username: string, limit: number): Promise<VideoRef[]> {
    const clean = username.replace(/^@/, '')
    const resultsLimit = Math.max(20, Math.min(2000, limit))
    const taskId = await this.submit('/tiktok/user-videos', {
      usernames: [`@${clean}`], results_limit: resultsLimit, sort_by: 'latest', region: 'CI',
    })
    const body = await this.wait(taskId)
    const raw = this.items(body)
    const videos = raw.map(item => ({
      id: this.videoId(item), url: this.videoUrl(item, clean),
      createdAt: item?.created_at || item?.published_at || item?.timestamp || item?.create_time || null,
    })).filter(video => video.id && video.url).slice(0, limit)
    console.log(JSON.stringify({event:'socq_user_videos',username:clean,task_id:taskId,raw_items:raw.length,usable_videos:videos.length,first_item_keys:raw[0]?Object.keys(raw[0]).slice(0,20):[],first_video_id:videos[0]?.id||null,version:'0.5.6'}))
    return videos
  }

  private async submitComments(url: string, resultsLimit = 100) {
    try { return await this.submit('/tiktok/comments', { urls: [url], results_limit: resultsLimit }) }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!/socq_400|socq_422/i.test(message)) throw error
      return await this.submit('/tiktok/comments', { url, results_limit: resultsLimit })
    }
  }

  async readVideoComments(username: string, video: VideoRef, since?: string | null): Promise<NormalizedComment[]> {
    if (!video.url) return []
    const taskId = await this.submitComments(video.url, 100)
    const body = await this.wait(taskId)
    const raw = this.items(body)
    const cutoff = since ? new Date(since).getTime() : 0
    const cleanAccount = username.replace(/^@/, '')
    const comments = raw.map((item: any, index: number) => {
      const author = item?.author || item?.user || item?.creator || {}
      const createdAt = item?.created_at || item?.published_at || item?.timestamp || item?.create_time || new Date().toISOString()
      const parsed = new Date(createdAt).getTime()
      const createdMs = Number.isFinite(parsed) ? parsed : Date.now()
      const authorUsername = String(author?.username || author?.unique_id || author?.uniqueId || item?.author_username || item?.username || item?.extra?.author_username || 'unknown').replace(/^@/, '')
      const commentId = String(item?.id || item?.comment_id || item?.cid || item?.commentId || `${video.id}-${authorUsername}-${createdMs}-${index}`)
      return {
        externalId: commentId, username: authorUsername,
        displayName: author?.display_name || author?.nickname || item?.author_name || null,
        userId: author?.id ? String(author.id) : author?.user_id ? String(author.user_id) : item?.author_id ? String(item.author_id) : null,
        text: String(item?.text || item?.comment || item?.content || item?.body || item?.description || ''),
        createdAt: new Date(createdMs).toISOString(), sourceType: 'video_comment' as const,
        sourceAccount: cleanAccount, sourceContentId: video.id, sourceUrl: video.url,
        metadata: {provider:'socq',task_id:taskId,likes:item?.metrics?.likes??item?.like_count??item?.likes??null,replies:item?.metrics?.replies??item?.reply_count??item?.replies??null,is_creator_reply:item?.is_creator_reply??item?.creator_interaction??null},
      }
    }).filter(comment => comment.text.trim().length > 0 && new Date(comment.createdAt).getTime() > cutoff)
    console.log(JSON.stringify({event:'socq_video_comments',username:cleanAccount,video_id:video.id,task_id:taskId,raw_items:raw.length,usable_comments:comments.length,first_item_keys:raw[0]?Object.keys(raw[0]).slice(0,20):[],version:'0.5.6'}))
    return comments
  }
}
