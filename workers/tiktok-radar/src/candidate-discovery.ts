import { createClient } from '@supabase/supabase-js'
import { SocQTikTokVideoProvider, type SocQDiscoveryVideo } from './provider-socq.js'

const SUPABASE_URL=process.env.SUPABASE_URL||''
const SUPABASE_PUBLISHABLE_KEY=process.env.SUPABASE_PUBLISHABLE_KEY||''
const RADAR_WORKER_TOKEN=process.env.RADAR_WORKER_TOKEN||''
const SOCQ_API_KEY=process.env.SOCQ_API_KEY||''
const DISCOVERY_MS=Number(process.env.RADAR_DISCOVERY_MS||6*60*60_000)
const CREDIT_COOLDOWN_MS=Number(process.env.RADAR_SOCQ_CREDIT_COOLDOWN_MS||6*60*60_000)
const supabase=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}})
const provider=SOCQ_API_KEY?new SocQTikTokVideoProvider(SOCQ_API_KEY):null

const QUERIES=[
  'voiture abidjan',
  "voiture côte d'ivoire",
  'vente voiture abidjan',
  'automobile abidjan',
]
const AUTO_WORDS=['voiture','auto','automobile','suv','4x4','toyota','mercedes','bmw','jetour','changan','prado','land cruiser','vente','occasion','véhicule','vehicule','motor','motors','cars','car']
const GEO_WORDS=['abidjan','côte d’ivoire',"côte d'ivoire",'cote d ivoire','ivoire','ci','cocody','marcory','treichville','yopougon','plateau','225']
const ACCOUNT_AUTO_WORDS=['auto','automobile','motor','motors','car','cars','voiture','garage','vehicle','vehicule']

function textScore(text:string,words:string[],each:number,max:number){
  const t=text.toLowerCase(); let s=0
  for(const w of words)if(t.includes(w))s+=each
  return Math.min(max,s)
}
function n(v:number|null|undefined){return Number(v||0)}
function candidateScore(v:SocQDiscoveryVideo){
  const text=`${v.caption||''} ${v.displayName||''} ${v.username}`.toLowerCase()
  const accountText=`${v.displayName||''} ${v.username}`.toLowerCase()
  const auto=textScore(text,AUTO_WORDS,10,60)
  const geo=textScore(text,GEO_WORDS,15,45)
  const accountAuto=textScore(accountText,ACCOUNT_AUTO_WORDS,10,30)
  const engagement=Math.min(20,(n(v.views)>=10000?8:n(v.views)>=2000?4:0)+(n(v.comments)>=30?6:n(v.comments)>=5?3:0)+(n(v.likes)>=500?4:n(v.likes)>=50?2:0)+(n(v.followers)>=5000?2:0))
  const queryMatchBonus=15
  const discovery=Math.min(100,auto+geo+accountAuto+engagement+queryMatchBonus)
  return {auto:Math.min(100,auto+accountAuto),geo:Math.min(100,geo),engagement,accountAuto,discovery}
}

async function rpc<T>(name:string,args:Record<string,unknown>):Promise<T>{
  const {data,error}=await supabase.rpc(name,args); if(error)throw error; return data as T
}

function isCreditError(message:string){return /socq_402|insufficient credits/i.test(message)}
let running=false
let creditBlockedUntil=0
export async function runCandidateDiscovery(){
  if(running||!provider)return
  if(Date.now()<creditBlockedUntil){
    console.log(JSON.stringify({event:'candidate_discovery_paused',reason:'socq_credit_circuit_open',retry_after:new Date(creditBlockedUntil).toISOString(),version:'0.5.8'}))
    return
  }
  running=true
  try{
    const {data:watch}=await supabase.from('tiktok_watchlist').select('username')
    const existing=new Set((watch||[]).map((x:any)=>String(x.username||'').toLowerCase()))
    let seenVideos=0, upserts=0, skippedExisting=0, rejectedLowQuality=0, queriesAttempted=0
    for(const query of QUERIES){
      try{
        queriesAttempted++
        const videos=await provider.searchPublicVideos(query,20)
        seenVideos+=videos.length
        const bestByUser=new Map<string,SocQDiscoveryVideo>()
        for(const v of videos){
          const u=v.username.toLowerCase()
          const current=bestByUser.get(u)
          if(!current||n(v.comments)+n(v.views)/100>n(current.comments)+n(current.views)/100)bestByUser.set(u,v)
        }
        for(const v of bestByUser.values()){
          const username=v.username.toLowerCase()
          if(existing.has(username)){skippedExisting++;continue}
          const score=candidateScore(v)
          if(score.auto<20 || score.discovery<45){rejectedLowQuality++;continue}
          const priority=Math.min(95,Math.max(45,Math.round(score.discovery)))
          const tier=priority>=80?'A':priority>=60?'B':'C'
          await rpc<string>('radar_worker_upsert_watchlist_suggestion',{p_token:RADAR_WORKER_TOKEN,p_row:{
            username,display_name:v.displayName||null,country_code:'CI',city:'Abidjan',account_type:'auto',
            source_type:'tiktok_search',source_url:v.videoUrl||null,geo_score:score.geo,auto_relevance_score:score.auto,
            purchase_signal_count:0,live_signal_count:0,video_signal_count:1,suggested_priority:priority,suggested_tier:tier,
            provider_name:'socq',discovery_query:query,discovery_score:score.discovery,discovered_video_url:v.videoUrl||null,
            discovered_caption:(v.caption||'').slice(0,1000),
            discovered_metrics:{followers:v.followers,views:v.views,likes:v.likes,comments:v.comments,shares:v.shares,created_at:v.createdAt,engagement_score:score.engagement,account_auto_score:score.accountAuto},
            evidence:{source:'socq_tiktok_search',query,video_url:v.videoUrl||null,caption:(v.caption||'').slice(0,500),auto_score:score.auto,geo_score:score.geo,engagement_score:score.engagement}
          }})
          upserts++
        }
      }catch(e){
        const message=e instanceof Error?e.message:String(e)
        console.error('discovery_query_error',query,message)
        if(isCreditError(message)){
          creditBlockedUntil=Date.now()+CREDIT_COOLDOWN_MS
          console.error('candidate_discovery_credit_blocked',JSON.stringify({query,cooldown_ms:CREDIT_COOLDOWN_MS,retry_after:new Date(creditBlockedUntil).toISOString(),version:'0.5.8'}))
          break
        }
      }
    }
    console.log(JSON.stringify({event:'candidate_discovery',queries:QUERIES.length,queries_attempted:queriesAttempted,seen_videos:seenVideos,suggestions_upserted:upserts,skipped_existing:skippedExisting,rejected_low_quality:rejectedLowQuality,credit_circuit_open:Date.now()<creditBlockedUntil,interval_ms:DISCOVERY_MS,version:'0.5.8'}))
  }finally{running=false}
}

export function startCandidateDiscovery(){
  if(!provider){console.log('GF Auto TikTok Radar V0.5.8 discovery disabled: SOCQ_API_KEY missing');return}
  setTimeout(()=>void runCandidateDiscovery(),15_000)
  setInterval(()=>void runCandidateDiscovery(),Math.max(60*60_000,DISCOVERY_MS))
  console.log(JSON.stringify({event:'candidate_discovery_enabled',queries:QUERIES,interval_ms:DISCOVERY_MS,version:'0.5.8'}))
}
