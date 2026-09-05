import { useEffect, useMemo, useState } from 'react'
import { Activity, CircleDollarSign, Link2, Radio, RefreshCw, Target, Timer, Users } from 'lucide-react'
import type { Lang } from '../lib/modules'
import { getLiveCommandCenter, type SellerLiveRow } from '../lib/liveCommandCenter'
import '../live-command-center.css'

type Props={lang:Lang}

export default function LiveCommandCenter({lang}:Props){
 const zh=lang==='zh'
 const [rows,setRows]=useState<SellerLiveRow[]>([]),[summary,setSummary]=useState({sellers:0,connected:0,liveNow:0,leads:0,appointments:0,visits:0,sales:0,revenue:0})
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[filter,setFilter]=useState<'all'|'live'|'offline'|'unconnected'>('all')
 const load=async()=>{setLoading(true);setError('');try{const data=await getLiveCommandCenter();setRows(data.rows);setSummary(data.summary)}catch(e:any){setError(e?.message||String(e))}finally{setLoading(false)}}
 useEffect(()=>{void load();const id=window.setInterval(()=>void load(),15000);return()=>window.clearInterval(id)},[])
 const shown=useMemo(()=>rows.filter(r=>filter==='all'||(filter==='live'&&r.live)||(filter==='offline'&&!r.live&&r.connected)||(filter==='unconnected'&&!r.connected)),[rows,filter])
 const money=(n:number)=>n?`${Math.round(n/100000)/10} M CFA`:'0'
 return <main className="lcc-page">
  <section className="lcc-hero"><div><span><Radio size={14}/> LIVE SALES AI • COMMAND CENTER V0.4.1</span><h1>{zh?'30人直播作战总控台':'Centre de commandement LIVE — 30 vendeurs'}</h1><p>{zh?'老板/店长统一查看每个销售的TikTok连接、直播状态、线索和延迟成交结果。':'Vue management : connexion TikTok, statut LIVE, leads et conversions différées par vendeur.'}</p></div><button onClick={()=>void load()}><RefreshCw size={16}/>{zh?'刷新':'Actualiser'}</button></section>
  {error&&<div className="lcc-error">{error}</div>}
  <section className="lcc-kpis">{[
    [zh?'销售人数':'Vendeurs',summary.sellers,Users],[zh?'已连接TikTok':'TikTok connectés',summary.connected,Link2],[zh?'正在直播':'En LIVE',summary.liveNow,Radio],[zh?'LIVE线索':'Leads LIVE',summary.leads,Target],[zh?'预约':'RDV',summary.appointments,Timer],[zh?'到店':'Visites',summary.visits,Activity],[zh?'成交':'Ventes',summary.sales,CircleDollarSign],[zh?'归因成交额':'CA attribué',money(summary.revenue),CircleDollarSign]
  ].map(([n,v,Icon]:any)=><div key={n}><Icon size={18}/><small>{n}</small><strong>{v}</strong></div>)}</section>
  <section className="lcc-toolbar"><div>{(['all','live','offline','unconnected'] as const).map(x=><button key={x} className={filter===x?'active':''} onClick={()=>setFilter(x)}>{x==='all'?(zh?'全部':'Tous'):x==='live'?(zh?'直播中':'LIVE'):x==='offline'?(zh?'已连接/未播':'Connecté / hors LIVE'):(zh?'未连接':'Non connecté')}</button>)}</div><span>{loading?(zh?'同步中…':'Synchronisation…'):`${shown.length}/${rows.length}`}</span></section>
  <section className="lcc-table-wrap"><table><thead><tr><th>{zh?'销售':'Vendeur'}</th><th>TikTok</th><th>{zh?'状态':'Statut'}</th><th>{zh?'在线':'Viewers'}</th><th>LIVE SCORE</th><th>{zh?'线索':'Leads'}</th><th>RDV</th><th>{zh?'到店':'Visites'}</th><th>{zh?'试驾':'Essais'}</th><th>{zh?'成交':'Ventes'}</th><th>0–30j</th><th>0–60j</th><th>0–90j</th><th>{zh?'平均成交周期':'Cycle moyen'}</th><th>{zh?'成交额':'CA'}</th></tr></thead><tbody>{shown.map(r=><tr key={r.profileId}><td><b>{r.name}</b><small>{r.profileId.slice(0,8)}</small></td><td><span className={r.connected?'lcc-conn ok':'lcc-conn'}>{r.connected?'●':'○'} {r.tiktokUsername?`@${r.tiktokUsername}`:r.tiktokName||(zh?'未连接':'Non connecté')}</span></td><td><span className={r.live?'lcc-live':'lcc-off'}>{r.live?(zh?'直播中':'LIVE'):(r.connected?(zh?'未直播':'OFFLINE'):(zh?'未连接':'NO LINK'))}</span></td><td>{r.live?<b>{r.viewers}</b>:'—'}</td><td>{r.live?<b>{r.liveScore}</b>:'—'}</td><td>{r.leads}</td><td>{r.appointments}</td><td>{r.visits}</td><td>{r.testDrives}</td><td><b>{r.sales}</b></td><td>{r.sold30}</td><td>{r.sold60}</td><td>{r.sold90}</td><td>{r.avgDaysToSale===null?'—':`${r.avgDaysToSale}j`}</td><td><b>{money(r.revenue)}</b></td></tr>)}</tbody></table>{!loading&&!shown.length&&<div className="lcc-empty">{zh?'暂无符合条件的数据':'Aucune donnée pour ce filtre'}</div>}</section>
  <section className="lcc-note"><b>{zh?'归因口径':'Règle d’attribution'}</b><p>{zh?'成交不是只看直播当天。系统持续观察0–30、0–60、0–90天，并保留更晚成交。Primary只计一次成交额，其他直播触点记为Assist，避免30个销售重复计算同一台车。':'La vente n’est pas limitée au jour du LIVE. Le système suit 0–30, 0–60 et 0–90 jours, puis conserve les conversions tardives. Le revenu n’est compté qu’une fois en Primary; les autres touches restent Assist.'}</p></section>
 </main>
}
