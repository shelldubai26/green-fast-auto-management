import { supabase } from './supabase'

export type TikTokConnection={
  id:string
  profile_id:string
  open_id:string
  display_name:string|null
  username:string|null
  avatar_url:string|null
  scopes:string[]
  token_status:'connected'|'expired'|'revoked'|'error'
  connected_at:string
}

export async function getMyTikTokConnection(profileId:string):Promise<TikTokConnection|null>{
  if(!supabase)return null
  const {data,error}=await supabase.from('tiktok_accounts')
    .select('id,profile_id,open_id,display_name,username,avatar_url,scopes,token_status,connected_at')
    .eq('profile_id',profileId)
    .eq('token_status','connected')
    .order('connected_at',{ascending:false})
    .limit(1)
    .maybeSingle()
  if(error)throw error
  return data as TikTokConnection|null
}

export async function listTikTokConnectionsForManager():Promise<TikTokConnection[]>{
  if(!supabase)return []
  const {data,error}=await supabase.from('tiktok_accounts')
    .select('id,profile_id,open_id,display_name,username,avatar_url,scopes,token_status,connected_at')
    .order('connected_at',{ascending:false})
  if(error)throw error
  return (data||[]) as TikTokConnection[]
}

export function getTikTokOAuthReadiness(){
  const clientKey=import.meta.env.VITE_TIKTOK_CLIENT_KEY || ''
  const redirectUri=import.meta.env.VITE_TIKTOK_REDIRECT_URI || ''
  return {ready:Boolean(clientKey&&redirectUri),clientKey,redirectUri}
}

export function getTikTokOAuthStartUrl(){
  return import.meta.env.VITE_TIKTOK_OAUTH_START_URL || ''
}

// OAuth code exchange and refresh-token handling must be server-side.
// Never store TikTok client_secret or refresh tokens in browser-accessible storage.
