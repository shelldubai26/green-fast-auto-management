import { useEffect, useState } from 'react'
import { Bot, CarFront, CircleDollarSign, RefreshCw, Target, TrendingUp } from 'lucide-react'
import type { Lang } from '../lib/modules'
import { getRevenueDirector, type RevenueRecommendation } from '../lib/revenueDirector'
import '../revenue-director.css'

export default function RevenueDirector({lang,userId}:{lang:Lang;userId:string}){
 const zh=lang==='zh';const[rows,setRows]=useState<RevenueRecommendation[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[coverage,setCoverage]=useState(0),[liveId,setLiveId]=useState<string|null>(null),[note,setNote]=useState('')
 const load=async()=>{setLoading(true);setError('');try{const r=await getRevenueDirector(userId);setRows(r.recommendations);setCoverage(r.grossProfitCoverage);setLiveId(r.liveSessionId);setNote(r.note)}catch(e:any){setError(e?.message||String(e))}finally{setLoading(false)}}
 useEffect(()=>{void load()},[userId])
 const money=(n:number)=>n?`${Math.round(n/100000)/10} M CFA`:'0'
 const top=rows[0]
 return <main className="rad-page">
  <section className="rad-hero"><div><span><Bot size={15}/> LIVE SALES AI • V0.5</span><h1>{zh?'Revenue AI Director':'Revenue AI Director'}</h1><p>{zh?'把直播决策从“互动更高”升级成“更可能产生真实成交价值”。':'Passe de l’optimisation de l’engagement à la valeur commerciale attendue.'}</p></div><button onClick={()=>void load()}><RefreshCw size={16}/>{zh?'刷新':'Actualiser'}</button></section>
  {error&&<div className="rad-error">{error}</div>}
  <section className="rad-status"><div><small>{zh?'毛利数据覆盖':'Couverture marge brute'}</small><strong>{coverage}%</strong></div><div><small>{zh?'当前直播':'Session LIVE'}</small><strong>{liveId?liveId.slice(0,8):zh?'暂无':'Aucune'}</strong></div><div><small>{zh?'模型数量':'Modèles analysés'}</small><strong>{rows.length}</strong></div></section>
  {top&&<section className="rad-primary"><div><span>{zh?'当前优先车型':'PRIORITÉ ACTUELLE'}</span><h2>{top.model}</h2><p>{zh?'建议优先围绕这款车做展示、对比和CTA，因为当前预计商业价值最高。':'À pousser en priorité pour démonstration, comparaison et CTA selon la valeur commerciale attendue.'}</p></div><div><small>{top.valueBasis==='gross_profit'?(zh?'预计毛利价值':'Valeur marge attendue'):(zh?'预计收入代理值':'Proxy de revenu attendu')}</small><strong>{money(top.expectedValue)}</strong><em>{zh?'成交概率基线':'Prob. de vente'} {(top.closeProbability*100).toFixed(1)}% · {top.confidence}</em></div></section>}
  <section className="rad-grid">{rows.map((r,i)=><article key={r.model} className={i===0?'top':''}><header><div><CarFront size={18}/><b>{r.model}</b></div><span>#{i+1}</span></header><div className="rad-metrics"><div><small>{zh?'车辆':'Unités'}</small><strong>{r.units}</strong></div><div><small>{zh?'运输中':'Transit'}</small><strong>{r.inTransit}</strong></div><div><small>{zh?'LIVE线索':'Leads LIVE'}</small><strong>{r.leads}</strong></div><div><small>{zh?'成交':'Ventes'}</small><strong>{r.sales}</strong></div></div><div className="rad-value"><Target size={15}/><div><small>{r.valueBasis==='gross_profit'?(zh?'真实毛利基础':'Marge brute réelle'):(zh?'收入代理基础':'Proxy revenu')}</small><b>{money(r.unitValue)}</b></div></div><div className="rad-score"><TrendingUp size={15}/><span>{zh?'预计商业价值':'Valeur attendue'}</span><strong>{money(r.expectedValue)}</strong></div><p>{r.reason}</p><footer><span>{(r.closeProbability*100).toFixed(1)}% close</span><span className={`q ${r.confidence.toLowerCase()}`}>{r.confidence}</span><span>{r.grossProfitAvailable?(zh?'毛利可用':'GP OK'):(zh?'成本缺失':'COST MISSING')}</span></footer></article>)}</section>
  {!loading&&!rows.length&&<div className="rad-empty">{zh?'暂无可计算车型':'Aucun modèle exploitable pour le moment'}</div>}
  <section className="rad-note"><CircleDollarSign size={18}/><div><b>{zh?'当前模型说明':'Règle actuelle V0.5'}</b><p>{zh?'成交概率使用Beta(1,11)内部基线，并随着真实LIVE成交样本增加逐步被真实数据替代。库存和当前直播车型意向只作为内部优先级修正。':'La probabilité de vente utilise un prior interne Beta(1,11), progressivement remplacé par les résultats LIVE observés. Le stock et l’intention de la session courante ne sont que des ajustements internes.'}</p><p>{note}</p></div></section>
 </main>
}
