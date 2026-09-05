import { useEffect, useMemo, useState } from 'react'
import { CircleDollarSign, Radio, RefreshCw, Target, Timer } from 'lucide-react'
import type { Lang } from '../lib/modules'
import { getMyLiveHistory, type MyLiveSessionRow } from '../lib/liveSessionDetail'
import LiveSessionDetailModal from './LiveSessionDetailModal'
import '../my-live-history.css'

type Props={lang:Lang;userId:string;onOpenCrm?:()=>void}

export default function MyLiveHistory({lang,userId,onOpenCrm}:Props){
  const zh=lang==='zh'
  const [rows,setRows]=useState<MyLiveSessionRow[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('')
  const [selected,setSelected]=useState<string|null>(null)
  const load=async()=>{setLoading(true);setError('');try{setRows(await getMyLiveHistory(userId))}catch(e:any){setError(e?.message||String(e))}finally{setLoading(false)}}
  useEffect(()=>{void load()},[userId])
  const total=useMemo(()=>rows.reduce((a,r)=>({sessions:a.sessions+1,leads:a.leads+r.leads,sales:a.sales+r.sales,revenue:a.revenue+r.revenue,avgDaysTotal:a.avgDaysTotal+(r.avgDaysToSale||0),avgDaysCount:a.avgDaysCount+(r.avgDaysToSale===null?0:1)}),{sessions:0,leads:0,sales:0,revenue:0,avgDaysTotal:0,avgDaysCount:0}),[rows])
  const avgDays=total.avgDaysCount?Math.round(total.avgDaysTotal/total.avgDaysCount*10)/10:null
  const money=(n:number)=>n?`${Math.round(n/100000)/10} M CFA`:'0'
  const date=(s:string|null)=>s?new Date(s).toLocaleString(zh?'zh-CN':'fr-FR',{month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'—'
  return <main className="mlh-page">
    <section className="mlh-hero"><div><span><Radio size={14}/> LIVE SALES AI • MY HISTORY V0.4.4</span><h1>{zh?'我的直播历史':'Mon historique LIVE'}</h1><p>{zh?'查看每场直播从实时表现到30/60/90天成交，并理解一笔成交可能由多个直播触点共同影响。':'Suivez chaque LIVE jusqu’aux ventes à 30/60/90 jours, avec lecture multi-touch des conversions.'}</p></div><button onClick={()=>void load()}><RefreshCw size={16}/>{zh?'刷新':'Actualiser'}</button></section>
    {error&&<div className="mlh-error">{error}</div>}
    <section className="mlh-kpis">{[[zh?'直播场次':'Sessions',total.sessions,Radio],[zh?'累计线索':'Leads',total.leads,Target],[zh?'累计成交':'Ventes',total.sales,CircleDollarSign],[zh?'归因成交额':'CA attribué',money(total.revenue),CircleDollarSign],[zh?'平均成交周期':'Cycle moyen',avgDays===null?'—':`${avgDays}j`,Timer]].map(([n,v,Icon]:any)=><div key={n}><Icon size={18}/><small>{n}</small><strong>{v}</strong></div>)}</section>
    <section className="mlh-table-wrap"><table><thead><tr><th>{zh?'时间':'Date'}</th><th>{zh?'状态':'Statut'}</th><th>{zh?'峰值在线':'Pic'}</th><th>LIVE SCORE</th><th>Leads</th><th>RDV</th><th>{zh?'到店':'Visites'}</th><th>{zh?'试驾':'Essais'}</th><th>{zh?'成交':'Ventes'}</th><th>0–30j</th><th>0–60j</th><th>0–90j</th><th>{zh?'晚成交':'Tardif'}</th><th>{zh?'成交额':'CA'}</th><th></th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td><b>{date(r.startedAt)}</b><small>{r.accountName||'TikTok'}</small></td><td><span className={r.status==='live'?'mlh-live':'mlh-ended'}>{r.status==='live'?(zh?'直播中':'LIVE'):(zh?'已结束':'TERMINÉ')}</span></td><td>{r.peak}</td><td><b>{r.liveScore||'—'}</b></td><td>{r.leads}</td><td>{r.appointments}</td><td>{r.visits}</td><td>{r.testDrives}</td><td><b>{r.sales}</b></td><td>{r.sold30}</td><td>{r.sold60}</td><td>{r.sold90}</td><td>{r.late}</td><td><b>{money(r.revenue)}</b></td><td><button className="mlh-open" onClick={()=>setSelected(r.id)}>{zh?'详情':'Détails'}</button></td></tr>)}</tbody></table>{!loading&&!rows.length&&<div className="mlh-empty">{zh?'还没有直播历史':'Aucun historique LIVE pour le moment'}</div>}{loading&&<div className="mlh-empty">{zh?'正在加载…':'Chargement…'}</div>}</section>
    {selected&&<LiveSessionDetailModal lang={lang} sessionId={selected} onClose={()=>setSelected(null)} onOpenCrm={onOpenCrm}/>} 
  </main>
}
