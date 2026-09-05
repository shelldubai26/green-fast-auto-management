import { supabase } from './supabase'
import type { DirectorAdvice, LiveScores } from './liveSalesAI'

export type PersistedComment={id:number;user:string;text:string;intent:number;tag:string}
export type LiveSnapshotInput={viewers:number;peak:number;avgWatchSeconds:number;commentsPerMinute:number;leads:number;hotLeads:number;appointments:number}

type MetricEnvelope={metrics:LiveSnapshotInput;scores:LiveScores}

export async function createLiveSession(userId:string){
  if(!supabase)throw new Error('Supabase not configured')
  const {data,error}=await supabase.from('live_sessions').insert({
    platform:'tiktok', presenter_id:userId, started_at:new Date().toISOString(), status:'live',
    title:'Green Fast Auto LIVE', campaign:'LIVE SALES AI V0.2.1'
  }).select('id').single()
  if(error)throw error
  return data.id as string
}

export async function saveSnapshot(sessionId:string,m:LiveSnapshotInput,s:LiveScores){
  if(!supabase)return
  const {error}=await supabase.from('live_metric_snapshots').insert({
    session_id:sessionId,viewers:m.viewers,peak:m.peak,avg_watch_seconds:m.avgWatchSeconds,
    comments_per_minute:m.commentsPerMinute,leads:m.leads,hot_leads:m.hotLeads,appointments:m.appointments,
    traffic_score:s.traffic,retention_score:s.retention,interaction_score:s.interaction,intent_score:s.intent,
    capture_score:s.capture,live_score:s.total
  })
  if(error)throw error
}

export async function seedLiveComments(sessionId:string,comments:PersistedComment[]){
  if(!supabase)return
  const rows=comments.map(c=>({session_id:sessionId,platform_comment_id:`demo-${c.id}`,platform_user_name:c.user,
    comment_text:c.text,intent_score:c.intent,intent_band:c.intent>=85?'A':c.intent>=65?'B':'C',intent_tags:[c.tag]}))
  const {error}=await supabase.from('live_comments').insert(rows)
  if(error)throw error
}

export async function routeCommentToCrm(sessionId:string,userId:string,c:PersistedComment){
  if(!supabase)throw new Error('Supabase not configured')
  const model=(c.text.match(/CS55|CS75|GS3|T2|M817|Song Pro/i)||[])[0]||null
  const note=`TikTok LIVE · ${c.user}\nCommentaire: ${c.text}\nIntent score: ${c.intent}/100 · ${c.tag}`
  const {data:customer,error:customerError}=await supabase.from('customers').insert({
    name:c.user,full_name:c.user,source:'tiktok',lead_source:'tiktok',lead_type:'active',stage:'new',
    assigned_sales:userId,assigned_to:userId,assigned_at:new Date().toISOString(),interested_model:model,
    notes:note,intent_score:c.intent,last_behavior_at:new Date().toISOString(),
    behavior_summary:{source:'tiktok_live',comment:c.text,intent:c.intent,tag:c.tag}
  }).select('id').single()
  if(customerError)throw customerError
  const customerId=customer.id as string
  const band=c.intent>=85?'A':c.intent>=65?'B':'C'
  const {error:leadError}=await supabase.from('live_leads').insert({session_id:sessionId,customer_id:customerId,
    platform:'tiktok',platform_user_name:c.user,interested_model:model,intent_score:c.intent,intent_band:band,
    intent_tags:[c.tag],assigned_to:userId,next_action:'WhatsApp / appel',status:'new'})
  if(leadError)throw leadError
  await supabase.from('live_comments').update({routed_to_crm:true,customer_id:customerId}).eq('session_id',sessionId).eq('platform_comment_id',`demo-${c.id}`)
  return customerId
}

export async function beginDirectorAction(sessionId:string,advice:DirectorAdvice,before:MetricEnvelope){
  if(!supabase)throw new Error('Supabase not configured')
  const {data,error}=await supabase.from('live_director_actions').insert({
    session_id:sessionId,priority:advice.priority,severity:advice.severity,action_type:advice.action,
    reason:`Weakest dimension: ${advice.priority}`,script_fr:advice.scriptFr,script_zh:advice.scriptZh,
    measure_for_seconds:advice.measureForSeconds,acknowledged_at:new Date().toISOString(),executed_at:new Date().toISOString(),
    pre_metric:before
  }).select('id').single()
  if(error)throw error
  return Number(data.id)
}

export async function completeDirectorAction(actionId:number,before:MetricEnvelope,after:MetricEnvelope){
  if(!supabase)return
  const resultDelta={
    liveScore:after.scores.total-before.scores.total,
    traffic:after.scores.traffic-before.scores.traffic,
    retention:after.scores.retention-before.scores.retention,
    interaction:after.scores.interaction-before.scores.interaction,
    intent:after.scores.intent-before.scores.intent,
    capture:after.scores.capture-before.scores.capture,
    viewers:after.metrics.viewers-before.metrics.viewers,
    avgWatchSeconds:after.metrics.avgWatchSeconds-before.metrics.avgWatchSeconds,
    commentsPerMinute:+(after.metrics.commentsPerMinute-before.metrics.commentsPerMinute).toFixed(1),
    leads:after.metrics.leads-before.metrics.leads,
    hotLeads:after.metrics.hotLeads-before.metrics.hotLeads,
    appointments:after.metrics.appointments-before.metrics.appointments
  }
  const {error}=await supabase.from('live_director_actions').update({post_metric:after,result_delta:resultDelta}).eq('id',actionId)
  if(error)throw error
  return resultDelta
}

export async function endLiveSession(sessionId:string,m:LiveSnapshotInput){
  if(!supabase)return
  const {error}=await supabase.from('live_sessions').update({status:'ended',ended_at:new Date().toISOString(),peak_concurrent:m.peak,
    avg_watch_seconds:m.avgWatchSeconds,leads:m.leads,appointments:m.appointments}).eq('id',sessionId)
  if(error)throw error
}
