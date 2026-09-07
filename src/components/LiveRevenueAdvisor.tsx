import { useCallback, useEffect, useMemo, useState } from 'react'
import { CircleDollarSign, RefreshCw, Sparkles, Target } from 'lucide-react'
import type { Lang } from '../lib/modules'
import { getRevenueDirector, type RevenueRecommendation } from '../lib/revenueDirector'
import '../live-revenue-advisor.css'

export default function LiveRevenueAdvisor({lang,userId,onPriorityChange}:{lang:Lang;userId:string;onPriorityChange?:(r:RevenueRecommendation|null)=>void}){
 const zh=lang==='zh'
 const [rows,setRows]=useState<RevenueRecommendation[]>([])
 const [coverage,setCoverage]=useState(0)
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 const load=useCallback(async()=>{setLoading(true);setError('');try{const r=await getRevenueDirector(userId);setRows(r.recommendations);setCoverage(r.grossProfitCoverage);onPriorityChange?.(r.recommendations[0]||null)}catch(e:any){setError(e?.message||String(e));onPriorityChange?.(null)}finally{setLoading(false)}},[userId,onPriorityChange])
 useEffect(()=>{void load();const id=window.setInterval(()=>void load(),15000);return()=>window.clearInterval(id)},[load])
 const top=rows[0]
 const money=(n:number)=>n?`${Math.round(n/100000)/10} M CFA`:'—'
 const script=useMemo(()=>{if(!top)return ''
  if(top.model.includes('CS55'))return zh?'现在优先讲 CS55：先做后排空间展示，再报价格，最后用20万预订做CTA。':'Priorité CS55 : montrer l’espace arrière, annoncer le prix, puis CTA réservation 200 000 FCFA.'
  if(top.model.includes('CS75'))return zh?'现在优先讲 CS75：做空间/动力对比，直接问预算，再引导预约试驾。':'Priorité CS75 : comparaison espace/moteur, qualifier le budget, puis proposer un essai.'
  if(top.model.includes('GS3'))return zh?'现在优先讲 GS3：突出城市SUV性价比，做价格锚点，再引导WhatsApp留资。':'Priorité GS3 : valeur SUV urbain, ancrage prix, puis capture WhatsApp.'
  if(top.model.includes('T2'))return zh?'现在优先讲 T2：突出外观、通过性和配置差异，最后做库存稀缺CTA。':'Priorité T2 : design, capacité, différences de finition, puis CTA rareté stock.'
  return zh?`现在优先讲 ${top.model}：先展示核心卖点，再问购买时间，最后引导试驾/WhatsApp。`:`Priorité ${top.model} : bénéfice clé, timing d’achat, puis essai/WhatsApp.`
 },[top,zh])
 if(loading&&!top)return <section className="lra-shell"><span>{zh?'Revenue AI 正在计算…':'Revenue AI calcule la priorité…'}</span></section>
 if(error&&!top)return <section className="lra-shell lra-error"><span>{error}</span><button onClick={()=>void load()}><RefreshCw size={14}/></button></section>
 if(!top)return null
 return <section className="lra-shell">
  <div className="lra-head"><div><Sparkles size={17}/><b>{zh?'REVENUE AI · 当前直播商业优先级':'REVENUE AI · PRIORITÉ COMMERCIALE LIVE'}</b></div><button onClick={()=>void load()}><RefreshCw size={14}/></button></div>
  <div className="lra-main"><div className="lra-priority"><small>{zh?'现在优先车型':'MODÈLE PRIORITAIRE'}</small><strong>{top.model}</strong><span>{top.confidence} CONFIDENCE · {top.valueBasis==='gross_profit'?(zh?'真实毛利模式':'MARGE RÉELLE'):(zh?'收入代理模式':'PROXY REVENU')}</span></div><div className="lra-kpis"><div><Target size={15}/><small>{zh?'预计成交概率':'Prob. vente'}</small><b>{Math.round(top.closeProbability*1000)/10}%</b></div><div><CircleDollarSign size={15}/><small>{zh?(top.valueBasis==='gross_profit'?'预计毛利价值':'预计收入代理'):(top.valueBasis==='gross_profit'?'Valeur marge':'Proxy revenu')}</small><b>{money(top.expectedValue)}</b></div><div><small>{zh?'库存/在途':'Stock / transit'}</small><b>{top.inStock} / {top.inTransit}</b></div><div><small>{zh?'LIVE线索':'Leads LIVE'}</small><b>{top.leads}</b></div></div></div>
  <div className="lra-script"><b>{zh?'AI现在建议主播：':'Action recommandée maintenant :'}</b><span>{script}</span></div>
  <footer><span>{zh?`毛利数据覆盖 ${coverage}%`:`Couverture marge ${coverage}%`}</span><em>{zh?'当前TikTok实时指标仍为模拟；库存、CRM、价格与成交数据来自GF Auto。':'TikTok temps réel reste simulé ; stock, CRM, prix et ventes proviennent de GF Auto.'}</em></footer>
 </section>
}
