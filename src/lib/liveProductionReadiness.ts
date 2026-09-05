import { supabase,isSupabaseReady } from './supabase'
import { getConfiguredLiveProvider } from './liveDataProvider'

export type ReadinessLevel='ready'|'warning'|'blocked'
export type ReadinessCheck={id:string;level:ReadinessLevel;title:string;detail:string;value?:string}
export type ProductionReadiness={score:number;provider:string;checks:ReadinessCheck[];metrics:{vehicles:number;priceReady:number;landedCostReady:number;grossProfitReady:number;sales:number;tiktokConnected:number;sellers:number;liveSessions:number}}

async function count(table:string,configure?:(q:any)=>any){
 if(!supabase)return 0
 let q:any=supabase.from(table).select('id',{count:'exact',head:true})
 if(configure)q=configure(q)
 const {count,error}=await q
 if(error)throw error
 return Number(count||0)
}

export async function getProductionReadiness():Promise<ProductionReadiness>{
 const provider=getConfiguredLiveProvider()
 const publicClientKey=Boolean(import.meta.env.VITE_TIKTOK_CLIENT_KEY)
 const publicRedirect=Boolean(import.meta.env.VITE_TIKTOK_REDIRECT_URI)
 const oauthStartConfigured=Boolean(import.meta.env.VITE_TIKTOK_OAUTH_START_URL)||Boolean(import.meta.env.VITE_SUPABASE_URL)
 if(!supabase)return {score:0,provider:provider.label,checks:[{id:'supabase',level:'blocked',title:'Supabase',detail:'Supabase browser configuration is missing.'}],metrics:{vehicles:0,priceReady:0,landedCostReady:0,grossProfitReady:0,sales:0,tiktokConnected:0,sellers:0,liveSessions:0}}
 const [vehicles,priceReady,landedCostReady,grossProfitReady,sales,tiktokConnected,sellers,liveSessions]=await Promise.all([
  count('vehicles'),
  count('vehicles',q=>q.or('target_price_xof.gt.0,asking_price.gt.0,list_price_xof.gt.0')),
  count('vehicles',q=>q.or('landed_cost_xof.gt.0,landed_cost.gt.0')),
  count('vehicles',q=>q.gt('gross_profit',0)),
  count('sales',q=>q.not('sold_at','is',null)),
  count('tiktok_accounts',q=>q.eq('token_status','connected')),
  count('profiles',q=>q.eq('role','sales').eq('active',true)),
  count('live_sessions')
 ]).catch(async()=>{
  const vehicles=await count('vehicles').catch(()=>0),sales=await count('sales',q=>q.not('sold_at','is',null)).catch(()=>0),tiktokConnected=await count('tiktok_accounts',q=>q.eq('token_status','connected')).catch(()=>0),liveSessions=await count('live_sessions').catch(()=>0)
  return [vehicles,0,0,0,sales,tiktokConnected,0,liveSessions]
 })
 const marginCoverage=vehicles?Math.round(grossProfitReady/vehicles*100):0
 const costCoverage=vehicles?Math.round(landedCostReady/vehicles*100):0
 const priceCoverage=vehicles?Math.round(priceReady/vehicles*100):0
 const checks:ReadinessCheck[]=[
  {id:'supabase',level:isSupabaseReady?'ready':'blocked',title:'Core database',detail:isSupabaseReady?'Supabase client is configured.':'Supabase configuration missing.',value:isSupabaseReady?'READY':'BLOCKED'},
  {id:'provider',level:'warning',title:'LIVE realtime provider',detail:provider.kind==='simulation'?'Current cockpit realtime signals are simulation. Production needs verified official/partner LIVE access.':'Authorized-provider mode is selected, but capabilities remain disabled until access is verified.',value:provider.label},
  {id:'oauth',level:publicClientKey&&publicRedirect&&oauthStartConfigured?'warning':'blocked',title:'TikTok OAuth',detail:publicClientKey&&publicRedirect&&oauthStartConfigured?'Public OAuth configuration is present. Server-side Client Secret and end-to-end account test still require verification.':'Client Key / redirect / OAuth start configuration is incomplete.',value:publicClientKey&&publicRedirect?'PUBLIC CONFIG OK':'INCOMPLETE'},
  {id:'account',level:tiktokConnected>0?'ready':'blocked',title:'Real seller account test',detail:tiktokConnected>0?`${tiktokConnected} TikTok account(s) currently connected.`:'No seller TikTok account is currently connected and verified.',value:String(tiktokConnected)},
  {id:'economics',level:marginCoverage>=90?'ready':costCoverage>0?'warning':'blocked',title:'Vehicle economics',detail:`Price coverage ${priceCoverage}% · landed cost ${costCoverage}% · gross profit ${marginCoverage}%. Revenue AI stays in proxy mode without verified cost.`,value:`GP ${marginCoverage}%`},
  {id:'learning',level:sales>=30?'ready':sales>=10?'warning':'blocked',title:'Real outcome sample',detail:`${sales} completed sale(s) available for Revenue AI learning. Confidence should remain LOW with very small samples.`,value:String(sales)},
  {id:'history',level:liveSessions>0?'warning':'blocked',title:'Real LIVE history',detail:`${liveSessions} LIVE session(s) currently stored. Real-session QA is required before production rollout.`,value:String(liveSessions)},
 ]
 const weights:{[key in ReadinessLevel]:number}={ready:1,warning:.5,blocked:0}
 const score=Math.round(checks.reduce((s,c)=>s+weights[c.level],0)/checks.length*100)
 return {score,provider:provider.label,checks,metrics:{vehicles,priceReady,landedCostReady,grossProfitReady,sales,tiktokConnected,sellers,liveSessions}}
}
