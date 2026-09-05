import { supabase } from './supabase'
import type { DirectorAdvice, LiveScores } from './liveSalesAI'
import { getMyTikTokConnection } from './tiktokAccounts'

export type PersistedComment={id:number;user:string;text:string;intent:number;tag:string}
export type LiveSnapshotInput={viewers:number;peak:number;avgWatchSeconds:number;commentsPerMinute:number;leads:number;hotLeads:number;appointments:number}
export type LiveOutcome={leads:number;contacted:number;appointments:number;visits:number;testDrives:number;deposits:number;sales:number;revenue:number}
export type ActionAttribution={directorActionId:number;actionType:string;priority:string;assistedLeads:number;appointments:number;visits:number;testDrives:number;deposits:number;sales:number;revenue:number;liveScoreDelta:number}
export type ConversionLagStats={open:number;sold:number;within30:number;within60:number;within90:number;late:number;avgDays:number|null}
export type ActionEconomicContext={model:string;valueBasis:'gross_profit'|'revenue_proxy';closeProbability:number;unitValue:number;expectedValue:number;economicObjective:string;ctaType?:string}
type MetricEnvelope={metrics:LiveSnapshotInput;scores:LiveScores}

export async function createLiveSession(userId:string){
  if(!supabase)throw new Error('Supabase not configured')
  const connection=await getMyTikTokConnection(userId).catch(()=>null)
  const {data,error}=await supabase.from('live_sessions').insert({
    platform:'tiktok',presenter_id:userId,tiktok_account_id:connection?.token_status==='connected'?connection.id:null,
    account_name:connection?.display_name||connection?.username||null,attribution_window_days:90,
    started_at:new Date().toISOString(),status:'live',title:'Green Fast Auto LIVE',campaign:'LIVE SALES AI V0.5.2'
  }).select('id').single()
  if(error)throw error
  return data.id as string
}

export async function getMyLiveSessions(userId:string){if(!supabase)return [];const {data,error}=await supabase.from('live_sessions').select('*').eq('presenter_id',userId).order('started_at',{ascending:false});if(error)throw error;return data||[]}
export async function getTeamLiveSessions(){if(!supabase)return [];const {data,error}=await supabase.from('live_sessions').select('*').order('started_at',{ascending:false});if(error)throw error;return data||[]}
export async function saveSnapshot(sessionId:string,m:LiveSnapshotInput,s:LiveScores){if(!supabase)return;const{error}=await supabase.from('live_metric_snapshots').insert({session_id:sessionId,viewers:m.viewers,peak:m.peak,avg_watch_seconds:m.avgWatchSeconds,comments_per_minute:m.commentsPerMinute,leads:m.leads,hot_leads:m.hotLeads,appointments:m.appointments,traffic_score:s.traffic,retention_score:s.retention,interaction_score:s.interaction,intent_score:s.intent,capture_score:s.capture,live_score:s.total});if(error)throw error}
export async function seedLiveComments(sessionId:string,comments:PersistedComment[]){if(!supabase)return;const rows=comments.map(c=>({session_id:sessionId,platform_comment_id:`demo-${c.id}`,platform_user_name:c.user,comment_text:c.text,intent_score:c.intent,intent_band:c.intent>=85?'A':c.intent>=65?'B':'C',intent_tags:[c.tag]}));const{error}=await supabase.from('live_comments').insert(rows);if(error)throw error}

export async function routeCommentToCrm(sessionId:string,userId:string,c:PersistedComment){
  if(!supabase)throw new Error('Supabase not configured')
  const model=(c.text.match(/CS55|CS75|GS3|T2|M817|Song Pro/i)||[])[0]||null
  const note=`TikTok LIVE · ${c.user}\nCommentaire: ${c.text}\nIntent score: ${c.intent}/100 · ${c.tag}`
  const {data:customer,error:customerError}=await supabase.from('customers').insert({name:c.user,full_name:c.user,source:'tiktok',lead_source:'tiktok',lead_type:'active',stage:'new',assigned_sales:userId,assigned_to:userId,assigned_at:new Date().toISOString(),interested_model:model,notes:note,intent_score:c.intent,last_behavior_at:new Date().toISOString(),behavior_summary:{source:'tiktok_live',comment:c.text,intent:c.intent,tag:c.tag}}).select('id').single()
  if(customerError)throw customerError
  const customerId=customer.id as string,band=c.intent>=85?'A':c.intent>=65?'B':'C',now=new Date().toISOString()
  const {error:leadError}=await supabase.from('live_leads').insert({session_id:sessionId,customer_id:customerId,platform:'tiktok',platform_user_name:c.user,interested_model:model,intent_score:c.intent,intent_band:band,intent_tags:[c.tag],assigned_to:userId,next_action:'WhatsApp / appel',status:'new',source_locked_at:now,attribution_window_days:90})
  if(leadError)throw leadError
  await supabase.from('live_comments').update({routed_to_crm:true,customer_id:customerId}).eq('session_id',sessionId).eq('platform_comment_id',`demo-${c.id}`)
  return customerId
}

export async function getLiveOutcome(sessionId:string):Promise<LiveOutcome>{
  if(!supabase)return {leads:0,contacted:0,appointments:0,visits:0,testDrives:0,deposits:0,sales:0,revenue:0}
  const {data,error}=await supabase.from('live_leads').select('status,first_contact_at,appointment_at,visited_at,test_drive_at,deposit_at,won_at,attribution_role,attributed_revenue_xof').eq('session_id',sessionId)
  if(error)throw error
  const rows=data||[],primary=rows.filter((r:any)=>r.attribution_role==='primary'&&(r.won_at||r.status==='won'))
  return {leads:rows.length,contacted:rows.filter((r:any)=>r.first_contact_at||['contacted','qualified','appointment','visited','test_drive','deposit','won'].includes(r.status)).length,appointments:rows.filter((r:any)=>r.appointment_at||['appointment','visited','test_drive','deposit','won'].includes(r.status)).length,visits:rows.filter((r:any)=>r.visited_at||['visited','test_drive','deposit','won'].includes(r.status)).length,testDrives:rows.filter((r:any)=>r.test_drive_at||['test_drive','deposit','won'].includes(r.status)).length,deposits:rows.filter((r:any)=>r.deposit_at||['deposit','won'].includes(r.status)).length,sales:primary.length,revenue:primary.reduce((sum:number,r:any)=>sum+Number(r.attributed_revenue_xof||0),0)}
}

export async function getConversionLagStats(sessionId:string):Promise<ConversionLagStats>{if(!supabase)return {open:0,sold:0,within30:0,within60:0,within90:0,late:0,avgDays:null};const {data,error}=await supabase.from('live_conversion_lag').select('won_at,days_to_sale,conversion_window_status').eq('session_id',sessionId);if(error)throw error;const rows=data||[],sold=rows.filter((r:any)=>r.won_at),days=sold.map((r:any)=>Number(r.days_to_sale)).filter((x:number)=>Number.isFinite(x));return {open:rows.length-sold.length,sold:sold.length,within30:sold.filter((r:any)=>Number(r.days_to_sale)<=30).length,within60:sold.filter((r:any)=>Number(r.days_to_sale)<=60).length,within90:sold.filter((r:any)=>Number(r.days_to_sale)<=90).length,late:sold.filter((r:any)=>r.conversion_window_status==='late_conversion').length,avgDays:days.length?Math.round((days.reduce((a:number,b:number)=>a+b,0)/days.length)*10)/10:null}}
export async function getActionAttribution(sessionId:string):Promise<ActionAttribution[]>{if(!supabase)return [];const {data,error}=await supabase.from('live_action_attribution').select('director_action_id,action_type,priority,assisted_leads,appointments,visits,test_drives,deposits,sales,attributed_revenue_xof,result_delta').eq('session_id',sessionId).order('executed_at',{ascending:false});if(error)throw error;return (data||[]).map((r:any)=>({directorActionId:Number(r.director_action_id),actionType:r.action_type||'',priority:r.priority||'',assistedLeads:Number(r.assisted_leads||0),appointments:Number(r.appointments||0),visits:Number(r.visits||0),testDrives:Number(r.test_drives||0),deposits:Number(r.deposits||0),sales:Number(r.sales||0),revenue:Number(r.attributed_revenue_xof||0),liveScoreDelta:Number(r.result_delta?.liveScore||0)}))}

const inferCta=(advice:DirectorAdvice,economic?:ActionEconomicContext|null)=>economic?.ctaType||(/WHATSAPP|CAPTURE/i.test(advice.action)?'WHATSAPP':/TEST|DEMO/i.test(advice.action)?'TEST_DRIVE':/PRICE|BINARY/i.test(advice.action)?'PRICE_QUESTION':'ENGAGEMENT')
export async function beginDirectorAction(sessionId:string,advice:DirectorAdvice,before:MetricEnvelope,economic?:ActionEconomicContext|null){
  if(!supabase)throw new Error('Supabase not configured')
  const {data,error}=await supabase.from('live_director_actions').insert({session_id:sessionId,priority:advice.priority,severity:advice.severity,action_type:advice.action,reason:`Weakest dimension: ${advice.priority}`,script_fr:advice.scriptFr,script_zh:advice.scriptZh,measure_for_seconds:advice.measureForSeconds,acknowledged_at:new Date().toISOString(),executed_at:new Date().toISOString(),pre_metric:before,recommended_model:economic?.model||null,economic_objective:economic?.economicObjective||null,value_basis:economic?.valueBasis||null,close_probability:economic?.closeProbability??null,unit_value_xof:economic?.unitValue??null,expected_value_before_xof:economic?.expectedValue??null,cta_type:inferCta(advice,economic)}).select('id').single()
  if(error)throw error
  return Number(data.id)
}
export async function completeDirectorAction(actionId:number,before:MetricEnvelope,after:MetricEnvelope,economicAfter?:{expectedValue:number}|null){
  if(!supabase)return
  const resultDelta={liveScore:after.scores.total-before.scores.total,traffic:after.scores.traffic-before.scores.traffic,retention:after.scores.retention-before.scores.retention,interaction:after.scores.interaction-before.scores.interaction,intent:after.scores.intent-before.scores.intent,capture:after.scores.capture-before.scores.capture,viewers:after.metrics.viewers-before.metrics.viewers,avgWatchSeconds:after.metrics.avgWatchSeconds-before.metrics.avgWatchSeconds,commentsPerMinute:+(after.metrics.commentsPerMinute-before.metrics.commentsPerMinute).toFixed(1),leads:after.metrics.leads-before.metrics.leads,hotLeads:after.metrics.hotLeads-before.metrics.hotLeads,appointments:after.metrics.appointments-before.metrics.appointments}
  const patch:any={post_metric:after,result_delta:resultDelta}
  if(economicAfter){const {data}=await supabase.from('live_director_actions').select('expected_value_before_xof').eq('id',actionId).single();const beforeValue=Number(data?.expected_value_before_xof||0);patch.expected_value_after_xof=economicAfter.expectedValue;patch.expected_value_lift_xof=economicAfter.expectedValue-beforeValue}
  const {error}=await supabase.from('live_director_actions').update(patch).eq('id',actionId);if(error)throw error;return resultDelta
}
export async function endLiveSession(sessionId:string,m:LiveSnapshotInput){if(!supabase)return;const{error}=await supabase.from('live_sessions').update({status:'ended',ended_at:new Date().toISOString(),peak_concurrent:m.peak,avg_watch_seconds:m.avgWatchSeconds}).eq('id',sessionId);if(error)throw error}
