import { supabase } from './supabase'

export type RevenueRecommendation={model:string;units:number;inStock:number;inTransit:number;ordered:number;leads:number;sales:number;closeProbability:number;confidence:'LOW'|'MEDIUM'|'HIGH';valueBasis:'gross_profit'|'revenue_proxy';unitValue:number;expectedValue:number;grossProfitAvailable:boolean;reason:string}
export type RevenueLearningRow={presenterId:string;model:string;actionType:string;ctaType:string;valueBasis:string;actions:number;measuredActions:number;avgExpectedBefore:number;avgExpectedAfter:number;avgExpectedLift:number;assistedLeads:number;appointments:number;visits:number;testDrives:number;deposits:number;sales:number;revenue:number}

const n=(v:any)=>Number(v||0)
export async function getRevenueDirector(userId:string):Promise<{recommendations:RevenueRecommendation[];liveSessionId:string|null;grossProfitCoverage:number;note:string}>{
 if(!supabase)return {recommendations:[],liveSessionId:null,grossProfitCoverage:0,note:'Supabase unavailable'}
 const [{data:econ,error:e1},{data:perf,error:e2},{data:session}]=await Promise.all([
  supabase.from('live_revenue_model_economics').select('*'),
  supabase.from('live_revenue_model_performance').select('*'),
  supabase.from('live_sessions').select('id').eq('presenter_id',userId).eq('status','live').order('started_at',{ascending:false}).limit(1).maybeSingle()
 ])
 if(e1)throw e1;if(e2)throw e2
 const perfMap=new Map((perf||[]).map((r:any)=>[r.model_key,r]))
 let sessionInterest=new Map<string,number>()
 if(session?.id){const {data}=await supabase.from('live_leads').select('interested_model').eq('session_id',session.id);for(const r of data||[]){const m=String((r as any).interested_model||'').toUpperCase();const key=m.includes('CS55')?'CS55':m.includes('CS75')?'CS75':m.includes('GS3')?'GS3':m.includes('M817')?'M817':m.includes('T2')?'T2':m.includes('SONG PRO')?'SONG PRO':m||'UNKNOWN';sessionInterest.set(key,(sessionInterest.get(key)||0)+1)}}
 const rows=(econ||[]).map((r:any)=>{
  const p:any=perfMap.get(r.model_key)||{};const leads=n(p.leads),sales=n(p.sales)
  const closeProbability=(sales+1)/(leads+12)
  const gp=n(r.avg_gross_profit_xof),target=n(r.avg_target_price_xof),gpOk=n(r.gross_profit_samples)>0&&gp>0
  const unitValue=gpOk?gp:target
  const interest=sessionInterest.get(r.model_key)||0
  const inventoryFactor=Math.min(1.2,.8+n(r.units_total)*.04)
  const interestFactor=Math.min(1.35,1+interest*.08)
  const expectedValue=closeProbability*unitValue*inventoryFactor*interestFactor
  const confidence:RevenueRecommendation['confidence']=leads>=30?'HIGH':leads>=10?'MEDIUM':'LOW'
  return {model:r.model_key,units:n(r.units_total),inStock:n(r.units_in_stock),inTransit:n(r.units_in_transit),ordered:n(r.units_ordered),leads,sales,closeProbability,confidence,valueBasis:gpOk?'gross_profit':'revenue_proxy',unitValue,expectedValue,grossProfitAvailable:gpOk,reason:interest>0?`Current LIVE has ${interest} model-intent lead(s)`:`Inventory ${n(r.units_total)} · observed LIVE leads ${leads}` } as RevenueRecommendation
 }).filter(x=>x.unitValue>0).sort((a,b)=>b.expectedValue-a.expectedValue)
 const coverage=rows.length?Math.round(rows.filter(x=>x.grossProfitAvailable).length/rows.length*100):0
 return {recommendations:rows,liveSessionId:session?.id||null,grossProfitCoverage:coverage,note:coverage<100?'Gross-profit data is incomplete. Rankings without cost data use expected revenue proxy, not expected profit.':'Gross-profit economics available.'}
}

export async function getRevenueLearningMatrix(userId?:string,limit=40):Promise<RevenueLearningRow[]>{
 if(!supabase)return []
 let q=supabase.from('live_revenue_action_learning').select('*').order('sales',{ascending:false}).order('assisted_leads',{ascending:false}).limit(limit)
 if(userId)q=q.eq('presenter_id',userId)
 const {data,error}=await q
 if(error)throw error
 return (data||[]).map((r:any)=>({presenterId:r.presenter_id,model:r.model_key||'UNKNOWN',actionType:r.action_key||'UNKNOWN',ctaType:r.cta_key||'UNKNOWN',valueBasis:r.value_basis_key||'revenue_proxy',actions:n(r.actions),measuredActions:n(r.measured_actions),avgExpectedBefore:n(r.avg_expected_value_before_xof),avgExpectedAfter:n(r.avg_expected_value_after_xof),avgExpectedLift:n(r.avg_expected_value_lift_xof),assistedLeads:n(r.assisted_leads),appointments:n(r.appointments),visits:n(r.visits),testDrives:n(r.test_drives),deposits:n(r.deposits),sales:n(r.sales),revenue:n(r.attributed_revenue_xof)}))
}
