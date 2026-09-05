import { supabase } from './supabase'

export type MyLiveSessionRow={
  id:string
  startedAt:string|null
  endedAt:string|null
  status:string
  accountName:string|null
  peak:number
  avgWatch:number
  leads:number
  appointments:number
  visits:number
  testDrives:number
  sales:number
  revenue:number
  liveScore:number
  sold30:number
  sold60:number
  sold90:number
  late:number
  avgDaysToSale:number|null
}

export type SessionAction={
  id:number
  actionType:string
  priority:string
  executedAt:string|null
  scriptFr:string|null
  scriptZh:string|null
  liveScoreDelta:number
  retentionDelta:number
  interactionDelta:number
  leadsDelta:number
}

export type SessionComment={
  id:number
  user:string|null
  text:string
  intentScore:number
  intentBand:string|null
  intentTags:string[]
  routed:boolean
  customerId:string|null
  detectedAt:string
}

export type SessionLead={
  id:string
  customerId:string|null
  user:string|null
  model:string|null
  band:string|null
  score:number
  status:string
  createdAt:string
  firstContactAt:string|null
  appointmentAt:string|null
  visitedAt:string|null
  testDriveAt:string|null
  depositAt:string|null
  wonAt:string|null
  salePrice:number
  conversionDays:number|null
}

export type MultiTouchInfluence={
  customerId:string
  saleId:string
  sessionId:string
  presenterId:string|null
  role:string
  weight:number
  influenceValue:number
  salePrice:number
  touchPosition:number
  touchCount:number
  daysBeforeSale:number
}

export type SessionDetail={
  session:MyLiveSessionRow
  actions:SessionAction[]
  comments:SessionComment[]
  leads:SessionLead[]
  influence:MultiTouchInfluence[]
}

function emptySummary(id:string):MyLiveSessionRow{
  return {id,startedAt:null,endedAt:null,status:'unknown',accountName:null,peak:0,avgWatch:0,leads:0,appointments:0,visits:0,testDrives:0,sales:0,revenue:0,liveScore:0,sold30:0,sold60:0,sold90:0,late:0,avgDaysToSale:null}
}

export async function getMyLiveHistory(userId:string,limit=40):Promise<MyLiveSessionRow[]>{
  if(!supabase)return []
  const since=new Date(Date.now()-180*86400000).toISOString()
  const {data:sessions,error}=await supabase.from('live_sessions')
    .select('id,started_at,ended_at,status,account_name,peak_concurrent,avg_watch_seconds,leads,appointments,visits,test_drives,sales,revenue')
    .eq('presenter_id',userId).gte('created_at',since).order('started_at',{ascending:false}).limit(limit)
  if(error)throw error
  const ids=(sessions||[]).map((s:any)=>s.id)
  if(!ids.length)return []

  const [{data:snaps,error:sErr},{data:lags,error:lErr}]=await Promise.all([
    supabase.from('live_metric_snapshots').select('session_id,live_score,captured_at').in('session_id',ids).order('captured_at',{ascending:false}),
    supabase.from('live_conversion_lag').select('session_id,won_at,days_to_sale,conversion_window_status').in('session_id',ids)
  ])
  if(sErr)throw sErr;if(lErr)throw lErr
  const latestScore=new Map<string,number>()
  for(const r of snaps||[])if(!latestScore.has((r as any).session_id))latestScore.set((r as any).session_id,Number((r as any).live_score||0))
  const lagMap=new Map<string,any[]>()
  for(const r of lags||[]){const sid=(r as any).session_id;const arr=lagMap.get(sid)||[];arr.push(r);lagMap.set(sid,arr)}

  return (sessions||[]).map((s:any)=>{
    const lag=lagMap.get(s.id)||[]
    const sold=lag.filter((x:any)=>x.won_at&&Number.isFinite(Number(x.days_to_sale)))
    const avg=sold.length?sold.reduce((n:number,x:any)=>n+Number(x.days_to_sale||0),0)/sold.length:null
    return {
      id:s.id,startedAt:s.started_at,endedAt:s.ended_at,status:s.status,accountName:s.account_name||null,
      peak:Number(s.peak_concurrent||0),avgWatch:Number(s.avg_watch_seconds||0),leads:Number(s.leads||0),appointments:Number(s.appointments||0),visits:Number(s.visits||0),testDrives:Number(s.test_drives||0),sales:Number(s.sales||0),revenue:Number(s.revenue||0),liveScore:Number(latestScore.get(s.id)||0),
      sold30:sold.filter((x:any)=>Number(x.days_to_sale)<=30).length,sold60:sold.filter((x:any)=>Number(x.days_to_sale)<=60).length,sold90:sold.filter((x:any)=>Number(x.days_to_sale)<=90).length,late:sold.filter((x:any)=>x.conversion_window_status==='late_conversion').length,avgDaysToSale:avg===null?null:Math.round(avg*10)/10
    }
  })
}

export async function getLiveSessionDetail(sessionId:string):Promise<SessionDetail>{
  if(!supabase)return {session:emptySummary(sessionId),actions:[],comments:[],leads:[],influence:[]}
  const [{data:s,error:sError},{data:snap,error:snapError},{data:actions,error:aError},{data:comments,error:cError},{data:leads,error:lError},{data:lags,error:lagError},{data:influence,error:iError}]=await Promise.all([
    supabase.from('live_sessions').select('id,started_at,ended_at,status,account_name,peak_concurrent,avg_watch_seconds,leads,appointments,visits,test_drives,sales,revenue').eq('id',sessionId).single(),
    supabase.from('live_metric_snapshots').select('live_score,captured_at').eq('session_id',sessionId).order('captured_at',{ascending:false}).limit(1).maybeSingle(),
    supabase.from('live_director_actions').select('id,action_type,priority,executed_at,script_fr,script_zh,result_delta').eq('session_id',sessionId).order('executed_at',{ascending:false}),
    supabase.from('live_comments').select('id,platform_user_name,comment_text,intent_score,intent_band,intent_tags,routed_to_crm,customer_id,detected_at').eq('session_id',sessionId).order('detected_at',{ascending:true}),
    supabase.from('live_leads').select('id,customer_id,platform_user_name,interested_model,intent_band,intent_score,status,created_at,first_contact_at,appointment_at,visited_at,test_drive_at,deposit_at,won_at,sale_price_xof,conversion_delay_days').eq('session_id',sessionId).order('created_at',{ascending:true}),
    supabase.from('live_conversion_lag').select('won_at,days_to_sale,conversion_window_status').eq('session_id',sessionId),
    supabase.from('live_multitouch_influence').select('customer_id,sale_id,session_id,presenter_id,influence_role,influence_weight,influence_value_xof,sale_price_xof,touch_position,touch_count,days_before_sale').eq('session_id',sessionId)
  ])
  if(sError)throw sError;if(snapError)throw snapError;if(aError)throw aError;if(cError)throw cError;if(lError)throw lError;if(lagError)throw lagError;if(iError)throw iError
  const lag=lags||[],sold=lag.filter((x:any)=>x.won_at&&Number.isFinite(Number(x.days_to_sale)))
  const avg=sold.length?sold.reduce((n:number,x:any)=>n+Number(x.days_to_sale||0),0)/sold.length:null
  const session:MyLiveSessionRow={id:s.id,startedAt:s.started_at,endedAt:s.ended_at,status:s.status,accountName:s.account_name||null,peak:Number(s.peak_concurrent||0),avgWatch:Number(s.avg_watch_seconds||0),leads:Number(s.leads||0),appointments:Number(s.appointments||0),visits:Number(s.visits||0),testDrives:Number(s.test_drives||0),sales:Number(s.sales||0),revenue:Number(s.revenue||0),liveScore:Number((snap as any)?.live_score||0),sold30:sold.filter((x:any)=>Number(x.days_to_sale)<=30).length,sold60:sold.filter((x:any)=>Number(x.days_to_sale)<=60).length,sold90:sold.filter((x:any)=>Number(x.days_to_sale)<=90).length,late:sold.filter((x:any)=>x.conversion_window_status==='late_conversion').length,avgDaysToSale:avg===null?null:Math.round(avg*10)/10}
  return {
    session,
    actions:(actions||[]).map((r:any)=>({id:Number(r.id),actionType:r.action_type||'',priority:r.priority||'',executedAt:r.executed_at||null,scriptFr:r.script_fr||null,scriptZh:r.script_zh||null,liveScoreDelta:Number(r.result_delta?.liveScore||0),retentionDelta:Number(r.result_delta?.retention||0),interactionDelta:Number(r.result_delta?.interaction||0),leadsDelta:Number(r.result_delta?.leads||0)})),
    comments:(comments||[]).map((r:any)=>({id:Number(r.id),user:r.platform_user_name||null,text:r.comment_text,intentScore:Number(r.intent_score||0),intentBand:r.intent_band||null,intentTags:r.intent_tags||[],routed:Boolean(r.routed_to_crm),customerId:r.customer_id||null,detectedAt:r.detected_at})),
    leads:(leads||[]).map((r:any)=>({id:r.id,customerId:r.customer_id||null,user:r.platform_user_name||null,model:r.interested_model||null,band:r.intent_band||null,score:Number(r.intent_score||0),status:r.status,createdAt:r.created_at,firstContactAt:r.first_contact_at||null,appointmentAt:r.appointment_at||null,visitedAt:r.visited_at||null,testDriveAt:r.test_drive_at||null,depositAt:r.deposit_at||null,wonAt:r.won_at||null,salePrice:Number(r.sale_price_xof||0),conversionDays:r.conversion_delay_days===null?null:Number(r.conversion_delay_days)})),
    influence:(influence||[]).map((r:any)=>({customerId:r.customer_id,saleId:r.sale_id,sessionId:r.session_id,presenterId:r.presenter_id||null,role:r.influence_role||'',weight:Number(r.influence_weight||0),influenceValue:Number(r.influence_value_xof||0),salePrice:Number(r.sale_price_xof||0),touchPosition:Number(r.touch_position||0),touchCount:Number(r.touch_count||0),daysBeforeSale:Number(r.days_before_sale||0)}))
  }
}
