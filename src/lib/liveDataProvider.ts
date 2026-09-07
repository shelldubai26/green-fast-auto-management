import { supabase } from './supabase'

export type LiveProviderKind='simulation'|'tiktok_authorized'
export type LiveEventType='viewer_join'|'comment'|'like'|'share'|'follow'|'viewer_count'|'watch_time'|'gift'
export type LiveProviderEvent={type:LiveEventType;occurredAt:string;payload:Record<string,unknown>;providerEventId?:string}
export type LiveProviderCapability={event:LiveEventType;supported:boolean;source:'simulated'|'authorized'|'unavailable'}
export type LiveDataProvider={
 kind:LiveProviderKind
 label:string
 realtime:boolean
 authorized:boolean
 capabilities:LiveProviderCapability[]
}

const allEvents:LiveEventType[]=['viewer_join','comment','like','share','follow','viewer_count','watch_time','gift']

export function getConfiguredLiveProvider():LiveDataProvider{
 const requested=String(import.meta.env.VITE_LIVE_DATA_PROVIDER||'simulation').toLowerCase()
 if(requested==='tiktok_authorized'){
  return {kind:'tiktok_authorized',label:'TikTok Authorized Provider',realtime:true,authorized:true,capabilities:allEvents.map(event=>({event,supported:false,source:'unavailable'}))}
 }
 return {kind:'simulation',label:'Simulation Provider',realtime:false,authorized:false,capabilities:allEvents.map(event=>({event,supported:['comment','viewer_count','watch_time'].includes(event),source:'simulated'}))}
}

export async function persistProviderEvent(sessionId:string,event:LiveProviderEvent,provider=getConfiguredLiveProvider()){
 if(!supabase)return
 if(provider.kind==='tiktok_authorized'&&!provider.capabilities.some(c=>c.event===event.type&&c.supported)){
  throw new Error(`Authorized provider capability not verified for ${event.type}`)
 }
 const {error}=await supabase.from('live_provider_events').insert({
  session_id:sessionId,
  provider:provider.kind,
  event_type:event.type,
  provider_event_id:event.providerEventId||null,
  occurred_at:event.occurredAt,
  is_simulated:provider.kind==='simulation',
  payload:event.payload,
 })
 if(error)throw error
}

export function providerSafetyNote(provider:LiveDataProvider){
 return provider.kind==='simulation'
  ?'Simulation only. No claim of TikTok realtime access.'
  :'Authorized provider mode is configured, but event capabilities must be enabled only after verified official/partner access.'
}
