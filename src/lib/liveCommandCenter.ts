import { supabase } from './supabase'

export type SellerLiveRow={
  profileId:string
  name:string
  connected:boolean
  tiktokName:string|null
  tiktokUsername:string|null
  accountStatus:string|null
  live:boolean
  sessionId:string|null
  startedAt:string|null
  viewers:number
  peak:number
  avgWatch:number
  liveScore:number
  leads:number
  appointments:number
  visits:number
  testDrives:number
  sales:number
  revenue:number
  sold30:number
  sold60:number
  sold90:number
  avgDaysToSale:number|null
}

export type SellerSessionHistoryRow={
  sessionId:string
  startedAt:string|null
  endedAt:string|null
  status:string
  accountName:string|null
  campaign:string|null
  primaryVehicle:string|null
  peak:number
  avgWatch:number
  liveScore:number
  leads:number
  appointments:number
  visits:number
  testDrives:number
  sales:number
  revenue:number
  sold30:number
  sold60:number
  sold90:number
  lateSales:number
  avgDaysToSale:number|null
}

export type CommandCenterSummary={
  sellers:number
  connected:number
  liveNow:number
  leads:number
  appointments:number
  visits:number
  sales:number
  revenue:number
}

export async function getSellerLiveHistory(profileId:string):Promise<SellerSessionHistoryRow[]> {
  if(!supabase)return []
  const since=new Date(Date.now()-180*86400000).toISOString()
  const {data:sessions,error:sErr}=await supabase.from('live_sessions')
    .select('id,started_at,ended_at,status,account_name,campaign,primary_vehicle,peak_concurrent,avg_watch_seconds,leads,appointments,visits,test_drives,sales,revenue')
    .eq('presenter_id',profileId).gte('created_at',since).order('started_at',{ascending:false}).limit(40)
  if(sErr)throw sErr
  const ids=(sessions||[]).map((s:any)=>s.id)
  if(!ids.length)return []
  const [{data:snaps,error:snapErr},{data:lags,error:lagErr}]=await Promise.all([
    supabase.from('live_metric_snapshots').select('session_id,live_score,captured_at').in('session_id',ids).order('captured_at',{ascending:false}),
    supabase.from('live_conversion_lag').select('session_id,won_at,days_to_sale,conversion_window_status').in('session_id',ids)
  ])
  if(snapErr)throw snapErr;if(lagErr)throw lagErr
  const latestScore=new Map<string,number>()
  for(const s of snaps||[])if(!latestScore.has((s as any).session_id))latestScore.set((s as any).session_id,Number((s as any).live_score||0))
  const lagBySession=new Map<string,any[]>()
  for(const l of lags||[]){const id=(l as any).session_id;if(!id)continue;const list=lagBySession.get(id)||[];list.push(l);lagBySession.set(id,list)}
  return (sessions||[]).map((s:any)=>{
    const ls=lagBySession.get(s.id)||[]
    const sold=ls.filter((x:any)=>x.won_at&&Number.isFinite(Number(x.days_to_sale)))
    const within=(d:number)=>sold.filter((x:any)=>Number(x.days_to_sale)<=d).length
    const avg=sold.length?sold.reduce((n:number,x:any)=>n+Number(x.days_to_sale||0),0)/sold.length:null
    return {sessionId:s.id,startedAt:s.started_at||null,endedAt:s.ended_at||null,status:s.status||'ended',accountName:s.account_name||null,campaign:s.campaign||null,primaryVehicle:s.primary_vehicle||null,peak:Number(s.peak_concurrent||0),avgWatch:Number(s.avg_watch_seconds||0),liveScore:latestScore.get(s.id)||0,leads:Number(s.leads||0),appointments:Number(s.appointments||0),visits:Number(s.visits||0),testDrives:Number(s.test_drives||0),sales:Number(s.sales||0),revenue:Number(s.revenue||0),sold30:within(30),sold60:within(60),sold90:within(90),lateSales:sold.filter((x:any)=>x.conversion_window_status==='late_conversion'||Number(x.days_to_sale)>90).length,avgDaysToSale:avg===null?null:Math.round(avg*10)/10}
  })
}

export async function getLiveCommandCenter():Promise<{summary:CommandCenterSummary;rows:SellerLiveRow[]}> {
  if(!supabase) return {summary:{sellers:0,connected:0,liveNow:0,leads:0,appointments:0,visits:0,sales:0,revenue:0},rows:[]}

  const since=new Date(Date.now()-120*86400000).toISOString()
  const [{data:profiles,error:pErr},{data:accounts,error:aErr},{data:sessions,error:sErr},{data:lags,error:lErr}]=await Promise.all([
    supabase.from('profiles').select('id,full_name,role,active').eq('role','sales').eq('active',true).order('full_name'),
    supabase.from('tiktok_accounts').select('id,profile_id,display_name,username,token_status,connected_at').order('connected_at',{ascending:false}),
    supabase.from('live_sessions').select('id,presenter_id,tiktok_account_id,status,started_at,ended_at,leads,appointments,visits,test_drives,sales,revenue,peak_concurrent,avg_watch_seconds').gte('created_at',since).order('started_at',{ascending:false}),
    supabase.from('live_conversion_lag').select('presenter_id,won_at,days_to_sale').gte('lead_created_at',since)
  ])
  if(pErr)throw pErr;if(aErr)throw aErr;if(sErr)throw sErr;if(lErr)throw lErr

  const liveIds=(sessions||[]).filter((s:any)=>s.status==='live').map((s:any)=>s.id)
  let snaps:any[]=[]
  if(liveIds.length){
    const {data,error}=await supabase.from('live_metric_snapshots').select('session_id,viewers,peak,avg_watch_seconds,live_score,captured_at').in('session_id',liveIds).order('captured_at',{ascending:false})
    if(error)throw error
    snaps=data||[]
  }
  const latestSnap=new Map<string,any>()
  for(const s of snaps)if(!latestSnap.has(s.session_id))latestSnap.set(s.session_id,s)

  const accountByProfile=new Map<string,any>()
  for(const a of accounts||[])if(!accountByProfile.has((a as any).profile_id))accountByProfile.set((a as any).profile_id,a)
  const sessionsByProfile=new Map<string,any[]>()
  for(const s of sessions||[]){const id=(s as any).presenter_id;if(!id)continue;const list=sessionsByProfile.get(id)||[];list.push(s);sessionsByProfile.set(id,list)}
  const lagsByProfile=new Map<string,any[]>()
  for(const l of lags||[]){const id=(l as any).presenter_id;if(!id)continue;const list=lagsByProfile.get(id)||[];list.push(l);lagsByProfile.set(id,list)}

  const rows:SellerLiveRow[]=(profiles||[]).map((p:any)=>{
    const acc=accountByProfile.get(p.id)||null
    const ss=sessionsByProfile.get(p.id)||[]
    const active=ss.find((s:any)=>s.status==='live')||null
    const snap=active?latestSnap.get(active.id):null
    const ls=lagsByProfile.get(p.id)||[]
    const sold=ls.filter((x:any)=>x.won_at&&Number.isFinite(Number(x.days_to_sale)))
    const sum=(key:string)=>ss.reduce((n:number,s:any)=>n+Number(s[key]||0),0)
    const within=(days:number)=>sold.filter((x:any)=>Number(x.days_to_sale)<=days).length
    const avg=sold.length?sold.reduce((n:number,x:any)=>n+Number(x.days_to_sale||0),0)/sold.length:null
    return {
      profileId:p.id,name:p.full_name,connected:acc?.token_status==='connected',tiktokName:acc?.display_name||null,tiktokUsername:acc?.username||null,accountStatus:acc?.token_status||null,
      live:Boolean(active),sessionId:active?.id||null,startedAt:active?.started_at||null,
      viewers:Number(snap?.viewers||0),peak:Number(snap?.peak||active?.peak_concurrent||0),avgWatch:Number(snap?.avg_watch_seconds||active?.avg_watch_seconds||0),liveScore:Number(snap?.live_score||0),
      leads:sum('leads'),appointments:sum('appointments'),visits:sum('visits'),testDrives:sum('test_drives'),sales:sum('sales'),revenue:sum('revenue'),
      sold30:within(30),sold60:within(60),sold90:within(90),avgDaysToSale:avg===null?null:Math.round(avg*10)/10
    }
  })

  return {summary:{sellers:rows.length,connected:rows.filter(r=>r.connected).length,liveNow:rows.filter(r=>r.live).length,leads:rows.reduce((n,r)=>n+r.leads,0),appointments:rows.reduce((n,r)=>n+r.appointments,0),visits:rows.reduce((n,r)=>n+r.visits,0),sales:rows.reduce((n,r)=>n+r.sales,0),revenue:rows.reduce((n,r)=>n+r.revenue,0)},rows}
}
