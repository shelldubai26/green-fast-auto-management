import {createClient} from '@supabase/supabase-js'
const url=process.env.SUPABASE_URL||''
const key=process.env.SUPABASE_PUBLISHABLE_KEY||''
const token=process.env.RADAR_WORKER_TOKEN||''
const LOOP=Math.max(60_000,Number(process.env.RADAR_SLA_LOOP_MS||60_000))
export function startLeadSla(){if(!url||!key||!token)return;const db=createClient(url,key,{auth:{persistSession:false}});const run=async()=>{try{const{data,error}=await db.rpc('radar_worker_manage_lead_sla',{p_token:token});if(error)throw error;console.log(JSON.stringify({event:'lead_sla_tick',result:data,version:'0.6.7'}))}catch(e){console.error('lead_sla_error',e instanceof Error?e.message:String(e))}};setTimeout(()=>void run(),15_000);setInterval(()=>void run(),LOOP);console.log(JSON.stringify({event:'lead_sla_ready',interval_ms:LOOP,reminder_min:3,reclaim_min:10,version:'0.6.7'}))}
