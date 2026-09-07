import { createClient } from '@supabase/supabase-js'
import { HttpTikTokProvider } from './provider-http.js'
import { TikTokLiveConnectorPool } from './provider-live-connector.js'
import { IntentEngine, type IntentResult } from './intent-engine.js'
import type { NormalizedComment, WatchAccount } from './types.js'

const env=(name:string,required=true)=>{const v=process.env[name];if(required&&!v)throw new Error(`missing_env:${name}`);return v||''}
const SUPABASE_URL=env('SUPABASE_URL')
const SUPABASE_PUBLISHABLE_KEY=env('SUPABASE_PUBLISHABLE_KEY')
const RADAR_WORKER_TOKEN=env('RADAR_WORKER_TOKEN')
const VIDEO_PROVIDER_BASE_URL=env('RADAR_VIDEO_PROVIDER_BASE_URL',false)
const VIDEO_PROVIDER_TOKEN=env('RADAR_VIDEO_PROVIDER_TOKEN',false)
const EULER_SIGN_API_KEY=env('EULER_SIGN_API_KEY',false)
const LOOP_MS=Number(process.env.RADAR_LOOP_MS||60_000)
const supabase=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}})
const liveProvider=new TikTokLiveConnectorPool(EULER_SIGN_API_KEY||undefined)
const videoProvider=VIDEO_PROVIDER_BASE_URL?new HttpTikTokProvider(VIDEO_PROVIDER_BASE_URL,VIDEO_PROVIDER_TOKEN||undefined):null
const intentEngine=new IntentEngine(supabase,RADAR_WORKER_TOKEN)
const tierMinutes:Record<string,number>={A:10,B:30,C:120}

type Channel='live'|'video_comment'
async function rpc<T>(name:string,args:Record<string,unknown>):Promise<T>{const{data,error}=await supabase.rpc(name,args);if(error)throw error;return data as T}
async function loadWatchlist(){return await rpc<WatchAccount[]>('radar_worker_get_watchlist',{p_token:RADAR_WORKER_TOKEN})}
async function getState(id:string,channel:Channel){return await rpc<any>('radar_worker_get_state',{p_token:RADAR_WORKER_TOKEN,p_watchlist_id:id,p_channel:channel})}
async function due(a:WatchAccount,c:Channel){const s=await getState(a.id,c);if(!s?.last_checked_at)return true;const mins=Math.max(1,Number(a.scan_interval_minutes||tierMinutes[a.watch_tier]||120));return Date.now()-new Date(s.last_checked_at).getTime()>=mins*60_000}
async function saveState(a:WatchAccount,c:Channel,provider:string,patch:Record<string,unknown>){await rpc('radar_worker_save_state',{p_token:RADAR_WORKER_TOKEN,p_watchlist_id:a.id,p_channel:c,p_provider:provider,p_patch:patch})}
async function startRun(a:WatchAccount,c:Channel,provider:string){return await rpc<string>('radar_worker_start_scan_run',{p_token:RADAR_WORKER_TOKEN,p_watchlist_id:a.id,p_channel:c,p_provider:provider})}
async function finishRun(id:string|undefined,patch:Record<string,unknown>){if(id)await rpc('radar_worker_finish_scan_run',{p_token:RADAR_WORKER_TOKEN,p_run_id:id,p_patch:patch})}
async function saveProviderHealth(args:{providerKey:string;providerName:string;channel:Channel;enabled:boolean;ready:boolean;status:string;lastError?:string|null;metadata?:Record<string,unknown>}){
  await rpc('radar_worker_save_provider_health',{
    p_token:RADAR_WORKER_TOKEN,
    p_provider_key:args.providerKey,
    p_provider_name:args.providerName,
    p_channel:args.channel,
    p_enabled:args.enabled,
    p_ready:args.ready,
    p_status:args.status,
    p_last_error:args.lastError||null,
    p_metadata:args.metadata||{},
  })
}
async function publishProviderReadiness(){
  await Promise.all([
    saveProviderHealth({providerKey:'euler_live',providerName:'EulerStream / TikTok Live Connector',channel:'live',enabled:true,ready:Boolean(EULER_SIGN_API_KEY),status:EULER_SIGN_API_KEY?'configured':'missing_api_key',metadata:{env:'EULER_SIGN_API_KEY',version:'0.5.2'}}),
    saveProviderHealth({providerKey:'video_http',providerName:'TikTok Video Comment Provider',channel:'video_comment',enabled:Boolean(VIDEO_PROVIDER_BASE_URL),ready:Boolean(VIDEO_PROVIDER_BASE_URL),status:VIDEO_PROVIDER_BASE_URL?'configured':'not_configured',metadata:{env_base_url:'RADAR_VIDEO_PROVIDER_BASE_URL',env_token:'RADAR_VIDEO_PROVIDER_TOKEN',version:'0.5.2'}}),
  ])
}
async function evaluateComments(comments:NormalizedComment[]){const out:Array<{comment:NormalizedComment;intent:IntentResult}>=[];for(const comment of comments){if(comment.text.trim().length<2)continue;const intent=await intentEngine.evaluate(comment.text);if(intent.matched)out.push({comment,intent})}return out}
async function ingest(a:WatchAccount,evaluated:Array<{comment:NormalizedComment;intent:IntentResult}>,provider:string){let newMasters=0;for(const{comment:c,intent}of evaluated){const row={platform:'tiktok',source_event_id:`${c.sourceType}:${c.sourceAccount||a.username}:${c.externalId}`,tiktok_user_id:c.userId||null,username:c.username,display_name:c.displayName||null,source_type:c.sourceType,source_account:c.sourceAccount||a.username,source_url:c.sourceUrl||null,source_content_id:c.sourceContentId||null,original_text:c.text,intent_label:intent.primaryIntent,intent_score:intent.score,status:intent.grade==='A'?'high_intent':'new',market_country_code:a.country_code||'CI',market_city:a.city||'Abidjan',market_scope:a.market_scope||'abidjan_auto',geo_confidence:75,metadata:{provider,external_comment_id:c.externalId,intent_grade:intent.grade,matched_rules:intent.matches,...(c.metadata||{})},first_seen_at:c.createdAt,last_seen_at:c.createdAt};const created=await rpc<boolean>('radar_worker_insert_lead',{p_token:RADAR_WORKER_TOKEN,p_row:row});if(created)newMasters++}return newMasters}

function normalizeLiveProviderError(message:string){
  if(/euler_api_key_missing/i.test(message)) return {error:'euler_api_key_missing',outcome:'provider_missing'}
  if(/401|403|unauthor|api.?key|quota|rate.?limit/i.test(message)) return {error:message,outcome:'provider_auth_or_quota_error'}
  return {error:message,outcome:'error'}
}

async function scanLive(a:WatchAccount){
  if(!a.live_monitor||!(await due(a,'live')))return
  const provider='tiktok-live-connector'
  if(!EULER_SIGN_API_KEY){
    await saveState(a,'live',provider,{last_error:'euler_api_key_missing',last_items_seen:0,last_candidates_found:0,last_inserted_count:0,last_outcome:'provider_missing',consecutive_errors:0})
    return
  }
  const runId=await startRun(a,'live',provider)
  const state=await getState(a.id,'live')
  try{
    const live=await liveProvider.isLive(a.username)
    let items=0,candidates=0,inserted=0,cursor=state?.cursor_value||null
    if(live){
      const comments=await liveProvider.readLiveComments(a.username,cursor)
      items=comments.length
      const ev=await evaluateComments(comments)
      candidates=ev.length
      inserted=await ingest(a,ev,provider)
      cursor=comments.at(-1)?.createdAt||cursor
    }
    const outcome=!live?'offline':items===0?'live_no_comments':candidates===0?'live_comments_no_intent':inserted>0?'live_new_leads':'live_existing_leads_updated'
    const now=new Date().toISOString()
    await saveState(a,'live',provider,{live_status:live,cursor_value:cursor,last_success_at:now,last_error:null,last_items_seen:items,last_candidates_found:candidates,last_inserted_count:inserted,last_outcome:outcome,consecutive_errors:0})
    await finishRun(runId,{items_seen:items,candidates_found:candidates,inserted_count:inserted,error:null,outcome,live_status:live,metadata:{username:a.username,tier:a.watch_tier,scan_interval_minutes:a.scan_interval_minutes||tierMinutes[a.watch_tier],euler_key_configured:true}})
    await saveProviderHealth({providerKey:'euler_live',providerName:'EulerStream / TikTok Live Connector',channel:'live',enabled:true,ready:true,status:'healthy',metadata:{last_username:a.username,last_outcome:outcome,version:'0.5.2'}})
    console.log(JSON.stringify({event:'live_scan',username:a.username,live,items,candidates,new_leads:inserted,outcome,eulerKey:true}))
  }catch(e){
    const raw=e instanceof Error?e.message:String(e)
    const normalized=normalizeLiveProviderError(raw)
    await saveState(a,'live',provider,{last_error:normalized.error,last_items_seen:0,last_candidates_found:0,last_inserted_count:0,last_outcome:normalized.outcome})
    await finishRun(runId,{error:normalized.error,outcome:normalized.outcome,metadata:{username:a.username,euler_key_configured:true,raw_error:raw}})
    await saveProviderHealth({providerKey:'euler_live',providerName:'EulerStream / TikTok Live Connector',channel:'live',enabled:true,ready:false,status:normalized.outcome,lastError:normalized.error,metadata:{last_username:a.username,version:'0.5.2'}})
    console.error('live_scan_error',a.username,normalized.outcome,normalized.error)
  }
}

async function scanVideos(a:WatchAccount){
  if(!a.video_comment_monitor||!(await due(a,'video_comment')))return
  if(!videoProvider){await saveState(a,'video_comment','not-configured',{last_error:'video_provider_not_configured',last_items_seen:0,last_candidates_found:0,last_inserted_count:0,last_outcome:'provider_missing',consecutive_errors:0});return}
  const provider=videoProvider.name
  const runId=await startRun(a,'video_comment',provider)
  const state=await getState(a.id,'video_comment')
  try{
    const videos=await videoProvider.listRecentVideos(a.username,a.watch_tier==='A'?8:a.watch_tier==='B'?5:3)
    let items=0,candidates=0,inserted=0,newest=state?.cursor_value||null
    for(const video of videos){
      const comments=await videoProvider.readVideoComments(a.username,video,state?.cursor_value||null)
      items+=comments.length
      const ev=await evaluateComments(comments)
      candidates+=ev.length
      inserted+=await ingest(a,ev,provider)
      const last=comments.at(-1)?.createdAt
      if(last&&(!newest||new Date(last)>new Date(newest)))newest=last
    }
    const outcome=items===0?'video_no_comments':candidates===0?'video_comments_no_intent':inserted>0?'video_new_leads':'video_existing_leads_updated'
    const now=new Date().toISOString()
    await saveState(a,'video_comment',provider,{cursor_value:newest,last_success_at:now,last_error:null,last_items_seen:items,last_candidates_found:candidates,last_inserted_count:inserted,last_outcome:outcome,consecutive_errors:0})
    await finishRun(runId,{items_seen:items,candidates_found:candidates,inserted_count:inserted,error:null,outcome,metadata:{username:a.username,videos_scanned:videos.length}})
    await saveProviderHealth({providerKey:'video_http',providerName:'TikTok Video Comment Provider',channel:'video_comment',enabled:true,ready:true,status:'healthy',metadata:{last_username:a.username,last_outcome:outcome,version:'0.5.2'}})
    console.log(JSON.stringify({event:'video_scan',username:a.username,videos:videos.length,items,candidates,new_leads:inserted,outcome}))
  }catch(e){
    const m=e instanceof Error?e.message:String(e)
    await saveState(a,'video_comment',provider,{last_error:m,last_items_seen:0,last_candidates_found:0,last_inserted_count:0,last_outcome:'error'})
    await finishRun(runId,{error:m,outcome:'error',metadata:{username:a.username}})
    await saveProviderHealth({providerKey:'video_http',providerName:'TikTok Video Comment Provider',channel:'video_comment',enabled:true,ready:false,status:'error',lastError:m,metadata:{last_username:a.username,version:'0.5.2'}})
    console.error('video_scan_error',a.username,m)
  }
}

async function cycle(){await intentEngine.refresh();await publishProviderReadiness();const accounts=await loadWatchlist();for(const a of accounts)await Promise.all([scanLive(a),scanVideos(a)]);console.log(JSON.stringify({event:'cycle',at:new Date().toISOString(),accounts:accounts.length,videoProvider:Boolean(videoProvider),eulerKey:Boolean(EULER_SIGN_API_KEY),version:'0.5.2'}))}
async function main(){console.log('GF Auto TikTok Radar worker V0.5.2 started',JSON.stringify({eulerKey:Boolean(EULER_SIGN_API_KEY),videoProvider:Boolean(videoProvider)}));const shutdown=async()=>{await liveProvider.disconnectAll();process.exit(0)};process.once('SIGTERM',shutdown);process.once('SIGINT',shutdown);for(;;){try{await cycle()}catch(e){console.error('cycle_error',e)}await new Promise(r=>setTimeout(r,LOOP_MS))}}
void main()
