import { createClient } from '@supabase/supabase-js'

type LiveInput={
  watchlist_id:string
  username:string
  display_name?:string|null
  watch_tier?:string|null
  priority?:number|null
  live_monitor:boolean
  last_checked_at?:string|null
  last_success_at?:string|null
  live_status?:boolean|null
  last_items_seen?:number|null
  last_candidates_found?:number|null
  last_inserted_count?:number|null
  last_outcome?:string|null
  last_error?:string|null
}

const env=(name:string)=>{const v=process.env[name];if(!v)throw new Error(`missing_env:${name}`);return v}
const supabase=createClient(env('SUPABASE_URL'),env('SUPABASE_PUBLISHABLE_KEY'),{auth:{persistSession:false}})
const token=env('RADAR_WORKER_TOKEN')
const seenChecks=new Map<string,string>()
const intervalMs=Math.max(5_000,Number(process.env.RADAR_LIVE_WATCH_SYNC_MS||5_000))

async function rpc<T>(name:string,args:Record<string,unknown>):Promise<T>{
  const {data,error}=await supabase.rpc(name,args)
  if(error)throw error
  return data as T
}

async function syncOnce(){
  const inputs=await rpc<LiveInput[]>('radar_worker_get_live_watch_inputs',{p_token:token})
  for(const row of inputs||[]){
    const checked=row.last_checked_at||''
    if(!checked||seenChecks.get(row.watchlist_id)===checked)continue
    seenChecks.set(row.watchlist_id,checked)
    const live=row.live_status===true
    const items=Math.max(0,Number(row.last_items_seen||0))
    const candidates=Math.max(0,Number(row.last_candidates_found||0))
    const leads=Math.max(0,Number(row.last_inserted_count||0))
    const listening=live && !['offline','provider_missing','error'].includes(String(row.last_outcome||''))
    await rpc('radar_worker_live_watch_tick',{
      p_token:token,
      p_watchlist_id:row.watchlist_id,
      p_live:live,
      p_listening:listening,
      p_items_delta:items,
      p_candidates_delta:candidates,
      p_high_intent_delta:0,
      p_leads_delta:leads,
      p_last_comment_at:items>0?(row.last_success_at||checked):null,
      p_error:row.last_error||null,
    })
    if(live||items>0||leads>0){
      console.log(JSON.stringify({event:'live_watch_state',username:row.username,live,listening,items,candidates,new_leads:leads,outcome:row.last_outcome||null,version:'0.6.5'}))
    }
  }
}

export function startLiveWatch(){
  console.log(JSON.stringify({event:'live_watch_ready',interval_ms:intervalMs,version:'0.6.5'}))
  const run=()=>void syncOnce().catch(e=>console.error('live_watch_error',e instanceof Error?e.message:String(e)))
  setTimeout(run,2_000)
  setInterval(run,intervalMs)
}
