import {createClient} from '@supabase/supabase-js'
const url=process.env.SUPABASE_URL||''
const key=process.env.SUPABASE_PUBLISHABLE_KEY||''
const token=process.env.RADAR_WORKER_TOKEN||''
const DAY=Number(process.env.RADAR_RETENTION_LOOP_MS||86_400_000)
export function startLeadRetention(){if(!url||!key||!token)return;const db=createClient(url,key,{auth:{persistSession:false}});const run=async()=>{try{const{data,error}=await db.rpc('radar_worker_purge_invalid',{p_token:token});if(error)throw error;console.log(JSON.stringify({event:'lead_retention_purge',deleted:Number(data||0),version:'0.6.6'}))}catch(e){console.error('lead_retention_error',e instanceof Error?e.message:String(e))}};setTimeout(()=>void run(),60_000);setInterval(()=>void run(),Math.max(DAY,3_600_000));console.log(JSON.stringify({event:'lead_retention_ready',interval_ms:Math.max(DAY,3_600_000),version:'0.6.6'}))}
