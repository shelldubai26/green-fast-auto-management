import { supabase } from './supabase'

export type TikTokConnection={
  id:string
  user_id:string
  open_id:string|null
  display_name:string|null
  avatar_url:string|null
  status:'pending'|'connected'|'expired'|'revoked'|'error'
  granted_scopes:string[]
  token_expires_at:string|null
  refresh_expires_at:string|null
  last_synced_at:string|null
}

export async function getMyTikTokConnection(userId:string):Promise<TikTokConnection|null>{
  if(!supabase)return null
  const {data,error}=await supabase.from('tiktok_account_connections').select('*').eq('user_id',userId).maybeSingle()
  if(error)throw error
  return data as TikTokConnection|null
}

export async function createPendingTikTokConnection(userId:string){
  if(!supabase)throw new Error('Supabase not configured')
  const {data,error}=await supabase.from('tiktok_account_connections').upsert({user_id:userId,status:'pending',updated_at:new Date().toISOString()},{onConflict:'user_id'}).select('*').single()
  if(error)throw error
  return data as TikTokConnection
}

export function getTikTokOAuthStartUrl(){
  return import.meta.env.VITE_TIKTOK_OAUTH_START_URL || ''
}
