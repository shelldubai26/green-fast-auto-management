import { createClient } from '@supabase/supabase-js'
import { SocQPublicContactEnricher } from './public-contact-enrichment.js'

const SUPABASE_URL=process.env.SUPABASE_URL||''
const SUPABASE_PUBLISHABLE_KEY=process.env.SUPABASE_PUBLISHABLE_KEY||''
const RADAR_WORKER_TOKEN=process.env.RADAR_WORKER_TOKEN||''
const SOCQ_API_KEY=process.env.SOCQ_API_KEY||''
const ENRICH_MS=Number(process.env.RADAR_ENRICH_MS||15*60_000)
const supabase=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}})
const enricher=SOCQ_API_KEY?new SocQPublicContactEnricher(SOCQ_API_KEY):null

async function rpc<T>(name:string,args:Record<string,unknown>):Promise<T>{const{data,error}=await supabase.rpc(name,args);if(error)throw error;return data as T}
let running=false
export async function runLeadEnrichment(){
  if(running||!enricher)return
  running=true
  try{
    const queue=await rpc<Array<{id:string;username:string;intent_score:number}>>('radar_worker_get_enrichment_queue',{p_token:RADAR_WORKER_TOKEN,p_limit:5})
    let checked=0,found=0
    for(const lead of queue||[]){
      try{
        const contact=await enricher.lookup(lead.username)
        await rpc('radar_worker_save_public_contact',{p_token:RADAR_WORKER_TOKEN,p_lead_id:lead.id,p_contact:contact})
        checked++
        if(contact.phone||contact.whatsapp||contact.email)found++
        console.log(JSON.stringify({event:'lead_public_contact',username:lead.username,found:Boolean(contact.phone||contact.whatsapp||contact.email),score:lead.intent_score,version:'0.6.1'}))
      }catch(e){
        const m=e instanceof Error?e.message:String(e)
        console.error('lead_enrichment_error',lead.username,m)
        if(/socq_402|insufficient credits|socq_429/i.test(m))break
      }
    }
    console.log(JSON.stringify({event:'lead_enrichment_cycle',queued:(queue||[]).length,checked,found,version:'0.6.1'}))
  }finally{running=false}
}
export function startLeadEnrichment(){
  if(!enricher){console.log('TikTok public contact enrichment disabled: SOCQ_API_KEY missing');return}
  setTimeout(()=>void runLeadEnrichment(),30_000)
  setInterval(()=>void runLeadEnrichment(),Math.max(5*60_000,ENRICH_MS))
  console.log(JSON.stringify({event:'lead_enrichment_enabled',interval_ms:ENRICH_MS,version:'0.6.1'}))
}
