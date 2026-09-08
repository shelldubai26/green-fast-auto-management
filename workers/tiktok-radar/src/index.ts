import { createClient } from '@supabase/supabase-js'
import { HttpTikTokProvider } from './provider-http.js'
import { SocQTikTokVideoProvider } from './provider-socq.js'
import { TikTokLiveConnectorPool } from './provider-live-connector.js'
import { IntentEngine, type IntentResult } from './intent-engine.js'
import type { NormalizedComment, WatchAccount, VideoRef } from './types.js'

const env=(name:string,required=true)=>{const v=process.env[name];if(required&&!v)throw new Error(`missing_env:${name}`);return v||''}
const SUPABASE_URL=env('SUPABASE_URL')
const SUPABASE_PUBLISHABLE_KEY=env('SUPABASE_PUBLISHABLE_KEY')
const RADAR_WORKER_TOKEN=env('RADAR_WORKER_TOKEN')
const VIDEO_PROVIDER_BASE_URL=env('RADAR_VIDEO_PROVIDER_BASE_URL',false)
const VIDEO_PROVIDER_TOKEN=env('RADAR_VIDEO_PROVIDER_TOKEN',false)
const SOCQ_API_KEY=env('SOCQ_API_KEY',false)
const EULER_SIGN_API_KEY=env('EULER_SIGN_API_KEY',false)
const LOOP_MS=Number(process.env.RADAR_LOOP_MS||5_000)
const supabase=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}})
const liveProvider=new TikTokLiveConnectorPool(EULER_SIGN_API_KEY||undefined)
const videoProvider=SOCQ_API_KEY?new SocQTikTokVideoProvider(SOCQ_API_KEY):VIDEO_PROVIDER_BASE_URL?new HttpTikTokProvider(VIDEO_PROVIDER_BASE_URL,VIDEO_PROVIDER_TOKEN||undefined):null
const videoProviderKey=SOCQ_API_KEY?'socq_video':VIDEO_PROVIDER_BASE_URL?'video_http':'video_missing'
const videoProviderName=SOCQ_API_KEY?'SocQ TikTok User Videos + Comments':VIDEO_PROVIDER_BASE_URL?'TikTok Video Comment Provider':'TikTok Video Comment Provider'
const intentEngine=new IntentEngine(supabase,RADAR_WORKER_TOKEN)
const tierMinutes:Record<string,number>={A:10,B:30,C:120}
const liveDetectMinutes:Record<string,number>={A:1,B:5,C:15}
const VIDEO_CATALOG_REFRESH_MS=24*60*60_000

let lastEulerProbeAt=0
let eulerProbeHealthy=false
let eulerProbeError:string|null=null
const EULER_PROBE_TTL_MS=10*60_000

type Channel='live'|'video_comment'
type VideoPool={videos:VideoRef[];refreshedAt:number;rotation:number;active:Set<string>}
const videoPools=new Map<string,VideoPool>()

async function rpc<T>(name:string,args:Record<string,unknown>):Promise<T>{const{data,error}=await supabase.rpc(name,args);if(error)throw error;return data as T}
async function loadWatchlist(){return await rpc<WatchAccount[]>('radar_worker_get_watchlist',{p_token:RADAR_WORKER_TOKEN})}
async function getState(id:string,channel:Channel){return await rpc<any>('radar_worker_get_state',{p_token:RADAR_WORKER_TOKEN,p_watchlist_id:id,p_channel:channel})}
async function due(a:WatchAccount,c:Channel){
  const s=await getState(a.id,c)
  if(c==='live'&&s?.live_status===true&&liveProvider.isSessionActive(a.username))return true
  if(!s?.last_checked_at)return true
  const mins=c==='live'?Math.max(1,liveDetectMinutes[a.watch_tier]||15):Math.max(1,Number(a.scan_interval_minutes||tierMinutes[a.watch_tier]||120))
  return Date.now()-new Date(s.last_checked_at).getTime()>=mins*60_000
}
async function saveState(a:WatchAccount,c:Channel,provider:string,patch:Record<string,unknown>){await rpc('radar_worker_save_state',{p_token:RADAR_WORKER_TOKEN,p_watchlist_id:a.id,p_channel:c,p_provider:provider,p_patch:patch})}
async function startRun(a:WatchAccount,c:Channel,provider:string){return await rpc<string>('radar_worker_start_scan_run',{p_token:RADAR_WORKER_TOKEN,p_watchlist_id:a.id,p_channel:c,p_provider:provider})}
async function finishRun(id:string|undefined,patch:Record<string,unknown>){if(id)await rpc('radar_worker_finish_scan_run',{p_token:RADAR_WORKER_TOKEN,p_run_id:id,p_patch:patch})}
async function saveProviderHealth(args:{providerKey:string;providerName:string;channel:Channel;enabled:boolean;ready:boolean;status:string;lastError?:string|null;metadata?:Record<string,unknown>}){await rpc('radar_worker_save_provider_health',{p_token:RADAR_WORKER_TOKEN,p_provider_key:args.providerKey,p_provider_name:args.providerName,p_channel:args.channel,p_enabled:args.enabled,p_ready:args.ready,p_status:args.status,p_last_error:args.lastError||null,p_metadata:args.metadata||{}})}

async function probeEulerProvider(force=false){
  if(!EULER_SIGN_API_KEY){eulerProbeHealthy=false;eulerProbeError='euler_api_key_missing';return false}
  if(!force&&Date.now()-lastEulerProbeAt<EULER_PROBE_TTL_MS)return eulerProbeHealthy
  lastEulerProbeAt=Date.now()
  try{const result=await liveProvider.probeProvider();eulerProbeHealthy=Boolean(result.ok);eulerProbeError=result.ok?null:`euler_probe_http_${result.status}`;console.log(JSON.stringify({event:'euler_probe',ok:eulerProbeHealthy,http_status:result.status,version:'0.6.4'}))}
  catch(e){eulerProbeHealthy=false;eulerProbeError=e instanceof Error?e.message:String(e);console.error('euler_probe_error',eulerProbeError)}
  return eulerProbeHealthy
}
async function publishProviderReadiness(){
  const eulerReady=await probeEulerProvider();const videoReady=Boolean(videoProvider)
  await Promise.all([
    saveProviderHealth({providerKey:'euler_live',providerName:'EulerStream / TikTok Live Connector',channel:'live',enabled:true,ready:eulerReady,status:!EULER_SIGN_API_KEY?'missing_api_key':eulerReady?'healthy':'provider_auth_or_quota_error',lastError:eulerReady?null:eulerProbeError,metadata:{env:'EULER_SIGN_API_KEY',probe:'rate_limits_rest',version:'0.6.4'}}),
    saveProviderHealth({providerKey:videoProviderKey,providerName:videoProviderName,channel:'video_comment',enabled:videoReady,ready:videoReady,status:videoReady?'configured':'not_configured',metadata:{provider:SOCQ_API_KEY?'socq':VIDEO_PROVIDER_BASE_URL?'http':'none',version:'0.6.4'}}),
  ])
}
async function evaluateComments(comments:NormalizedComment[]){const out:Array<{comment:NormalizedComment;intent:IntentResult}>=[];for(const comment of comments){if(comment.text.trim().length<2)continue;const intent=await intentEngine.evaluate(comment.text);if(intent.matched)out.push({comment,intent})}return out}
async function ingest(a:WatchAccount,evaluated:Array<{comment:NormalizedComment;intent:IntentResult}>,provider:string){let newMasters=0;for(const{comment:c,intent}of evaluated){const row={platform:'tiktok',source_event_id:`${c.sourceType}:${c.sourceAccount||a.username}:${c.externalId}`,tiktok_user_id:c.userId||null,username:c.username,display_name:c.displayName||null,source_type:c.sourceType,source_account:c.sourceAccount||a.username,source_url:c.sourceUrl||null,source_content_id:c.sourceContentId||null,original_text:c.text,intent_label:intent.primaryIntent,intent_score:intent.score,status:intent.grade==='A'?'high_intent':'new',market_country_code:a.country_code||'CI',market_city:a.city||'Abidjan',market_scope:a.market_scope||'abidjan_auto',geo_confidence:75,metadata:{provider,external_comment_id:c.externalId,intent_grade:intent.grade,matched_rules:intent.matches,...(c.metadata||{})},first_seen_at:c.createdAt,last_seen_at:c.createdAt};const created=await rpc<boolean>('radar_worker_insert_lead',{p_token:RADAR_WORKER_TOKEN,p_row:row});if(created)newMasters++}return newMasters}

function normalizeLiveProviderError(message:string){if(/euler_api_key_missing/i.test(message))return{error:'euler_api_key_missing',outcome:'provider_missing'};if(/401|403|unauthor|api.?key|quota|rate.?limit/i.test(message))return{error:message,outcome:'provider_auth_or_quota_error'};return{error:message,outcome:'error'}}

async function scanLive(a:WatchAccount){
  if(!a.live_monitor||!(await due(a,'live')))return
  const provider='tiktok-live-connector'
  if(!EULER_SIGN_API_KEY){await saveState(a,'live',provider,{last_error:'euler_api_key_missing',last_outcome:'provider_missing'});return}
  const runId=await startRun(a,'live',provider);const state=await getState(a.id,'live')
  try{
    const live=await liveProvider.isLive(a.username)
    let items=0,candidates=0,inserted=0,cursor=state?.cursor_value||null
    if(live){const comments=await liveProvider.readLiveComments(a.username,cursor);items=comments.length;const ev=await evaluateComments(comments);candidates=ev.length;inserted=await ingest(a,ev,provider);cursor=comments.at(-1)?.createdAt||cursor}
    const outcome=!live?'offline':items===0?'live_no_comments':candidates===0?'live_comments_no_intent':inserted>0?'live_new_leads':'live_existing_leads_updated'
    const now=new Date().toISOString();await saveState(a,'live',provider,{live_status:live,cursor_value:cursor,last_success_at:now,last_error:null,last_items_seen:items,last_candidates_found:candidates,last_inserted_count:inserted,last_outcome:outcome,consecutive_errors:0})
    await finishRun(runId,{items_seen:items,candidates_found:candidates,inserted_count:inserted,error:null,outcome,live_status:live,metadata:{username:a.username,realtime_drain:liveProvider.isSessionActive(a.username),loop_ms:LOOP_MS,version:'0.6.4'}})
    if(items>0||inserted>0)console.log(JSON.stringify({event:'live_realtime',username:a.username,items,candidates,new_leads:inserted,outcome,version:'0.6.4'}))
  }catch(e){const raw=e instanceof Error?e.message:String(e);const normalized=normalizeLiveProviderError(raw);await saveState(a,'live',provider,{last_error:normalized.error,last_outcome:normalized.outcome});await finishRun(runId,{error:normalized.error,outcome:normalized.outcome,metadata:{username:a.username,version:'0.6.4'}});console.error('live_scan_error',a.username,normalized.outcome,normalized.error)}
}

async function videoBatch(a:WatchAccount){
  if(!videoProvider)return[] as VideoRef[]
  const key=a.username.toLowerCase();let pool=videoPools.get(key)
  const catalogLimit=a.watch_tier==='A'?40:a.watch_tier==='B'?25:15
  if(!pool||Date.now()-pool.refreshedAt>VIDEO_CATALOG_REFRESH_MS){const videos=await videoProvider.listRecentVideos(a.username,catalogLimit);pool={videos,refreshedAt:Date.now(),rotation:0,active:pool?.active||new Set<string>()};videoPools.set(key,pool)}
  const recentCount=a.watch_tier==='A'?8:a.watch_tier==='B'?5:3
  const maxBatch=a.watch_tier==='A'?12:a.watch_tier==='B'?8:5
  const selected=new Map<string,VideoRef>()
  for(const v of pool.videos.slice(0,recentCount))selected.set(v.id,v)
  for(const id of pool.active){const v=pool.videos.find(x=>x.id===id);if(v&&selected.size<maxBatch)selected.set(v.id,v)}
  const backlog=pool.videos.slice(recentCount)
  let attempts=0
  while(backlog.length&&selected.size<maxBatch&&attempts<backlog.length){const idx=pool.rotation%backlog.length;const v=backlog[idx];pool.rotation=(pool.rotation+1)%backlog.length;selected.set(v.id,v);attempts++}
  return [...selected.values()]
}
function markVideoActive(a:WatchAccount,video:VideoRef){const pool=videoPools.get(a.username.toLowerCase());if(!pool)return;pool.active.add(video.id);while(pool.active.size>12){const first=pool.active.values().next().value;if(!first)break;pool.active.delete(first)}}

async function scanVideos(a:WatchAccount){
  if(!a.video_comment_monitor||!(await due(a,'video_comment')))return
  if(!videoProvider){await saveState(a,'video_comment','not-configured',{last_error:'video_provider_not_configured',last_outcome:'provider_missing'});return}
  const provider=videoProvider.name;const runId=await startRun(a,'video_comment',provider);const state=await getState(a.id,'video_comment')
  try{
    const videos=await videoBatch(a);let items=0,candidates=0,inserted=0,newest=state?.cursor_value||null
    for(const video of videos){const comments=await videoProvider.readVideoComments(a.username,video,state?.cursor_value||null);if(comments.length)markVideoActive(a,video);items+=comments.length;const ev=await evaluateComments(comments);candidates+=ev.length;inserted+=await ingest(a,ev,provider);const last=comments.at(-1)?.createdAt;if(last&&(!newest||new Date(last)>new Date(newest)))newest=last}
    const outcome=videos.length===0?'video_no_videos':items===0?'video_no_comments':candidates===0?'video_comments_no_intent':inserted>0?'video_new_leads':'video_existing_leads_updated'
    const now=new Date().toISOString();await saveState(a,'video_comment',provider,{cursor_value:newest,last_success_at:now,last_error:null,last_items_seen:items,last_candidates_found:candidates,last_inserted_count:inserted,last_outcome:outcome,consecutive_errors:0});await finishRun(runId,{items_seen:items,candidates_found:candidates,inserted_count:inserted,error:null,outcome,metadata:{username:a.username,videos_scanned:videos.length,active_video_pool:true,version:'0.6.4'}})
    console.log(JSON.stringify({event:'video_active_pool_scan',username:a.username,videos:videos.length,items,candidates,new_leads:inserted,version:'0.6.4'}))
  }catch(e){const m=e instanceof Error?e.message:String(e);const authOrQuota=/socq_(401|402|403|429)|insufficient credits|unauthor|api.?key|quota|rate.?limit/i.test(m);const outcome=authOrQuota?'provider_auth_or_quota_error':'error';await saveState(a,'video_comment',provider,{last_error:m,last_outcome:outcome});await finishRun(runId,{error:m,outcome,metadata:{username:a.username,provider,version:'0.6.4'}});console.error('video_scan_error',a.username,provider,outcome,m)}
}

async function cycle(){await intentEngine.refresh();await publishProviderReadiness();const accounts=await loadWatchlist();for(const a of accounts)await Promise.all([scanLive(a),scanVideos(a)]);console.log(JSON.stringify({event:'cycle',at:new Date().toISOString(),accounts:accounts.length,loop_ms:LOOP_MS,videoProvider:videoProvider?.name||null,eulerProbeHealthy,version:'0.6.4'}))}
async function main(){console.log('GF Auto TikTok Radar worker V0.6.4 started',JSON.stringify({eulerKey:Boolean(EULER_SIGN_API_KEY),socqKey:Boolean(SOCQ_API_KEY),videoProvider:videoProvider?.name||null,loop_ms:LOOP_MS}));const shutdown=async()=>{await liveProvider.disconnectAll();process.exit(0)};process.once('SIGTERM',shutdown);process.once('SIGINT',shutdown);for(;;){try{await cycle()}catch(e){console.error('cycle_error',e)}await new Promise(r=>setTimeout(r,LOOP_MS))}}
void main()
