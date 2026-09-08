import { useEffect, useMemo, useState } from 'react'
import { Activity, Clock3, Flame, MessageCircle, Radio, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Lang } from '../lib/modules'

type WatchRow={
  watchlist_id:string
  status:'offline'|'live_detected'|'listening'|'lead_detected'|'live_ended'|'error'
  live_started_at:string|null
  live_ended_at:string|null
  last_event_at:string|null
  last_comment_at:string|null
  comments_seen:number
  candidates_found:number
  high_intent_found:number
  leads_inserted:number
  last_error:string|null
  updated_at:string
}
type Account={id:string;username:string;display_name:string|null;watch_tier:'A'|'B'|'C';priority:number|null}

const fmtTime=(v:string|null)=>v?new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(v)):'—'
const duration=(start:string|null,end:string|null)=>{
  if(!start)return'—'
  const ms=Math.max(0,new Date(end||Date.now()).getTime()-new Date(start).getTime())
  const mins=Math.floor(ms/60000)
  if(mins<60)return`${mins} min`
  return`${Math.floor(mins/60)}h ${mins%60}m`
}

export default function TikTokLiveWatchPanel({lang}:{lang:Lang}){
  const txt=(fr:string,zh:string)=>lang==='fr'?fr:zh
  const [rows,setRows]=useState<WatchRow[]>([])
  const [accounts,setAccounts]=useState<Account[]>([])
  const [loading,setLoading]=useState(true)
  const load=async()=>{
    if(!supabase)return
    setLoading(true)
    const [{data:statusData},{data:accountData}]=await Promise.all([
      supabase.from('tiktok_live_watch_status').select('*').order('updated_at',{ascending:false}),
      supabase.from('tiktok_watchlist').select('id,username,display_name,watch_tier,priority').eq('is_active',true).eq('live_monitor',true),
    ])
    setRows((statusData||[]) as WatchRow[])
    setAccounts((accountData||[]) as Account[])
    setLoading(false)
  }
  useEffect(()=>{void load();const t=setInterval(()=>void load(),10_000);return()=>clearInterval(t)},[])
  const accountMap=useMemo(()=>new Map(accounts.map(a=>[a.id,a])),[accounts])
  const ordered=useMemo(()=>[...rows].sort((a,b)=>{
    const rank=(s:WatchRow['status'])=>s==='lead_detected'?0:s==='listening'?1:s==='live_detected'?2:s==='error'?3:s==='live_ended'?4:5
    return rank(a.status)-rank(b.status)||new Date(b.updated_at).getTime()-new Date(a.updated_at).getTime()
  }),[rows])
  const liveNow=rows.filter(r=>['live_detected','listening','lead_detected'].includes(r.status)).length
  const leadsNow=rows.filter(r=>r.status==='lead_detected').length
  const comments=rows.reduce((n,r)=>n+r.comments_seen,0)
  const prospects=rows.reduce((n,r)=>n+r.leads_inserted,0)
  const statusLabel=(s:WatchRow['status'])=>({offline:txt('Hors ligne','未开播'),live_detected:txt('LIVE détecté','发现开播'),listening:txt('Écoute LIVE','实时监听'),lead_detected:txt('Prospect détecté','发现潜客'),live_ended:txt('LIVE terminé','直播结束'),error:txt('Erreur','异常')})[s]
  return <section className="live-watch-panel">
    <div className="roc-head"><div><span className="eyebrow">LIVE WATCH · OWNER</span><h2>{txt('Centre de veille LIVE','直播监控作战盘')}</h2><p>{txt("Détection d'ouverture → écoute temps réel → prospects → fin du LIVE.",'开播巡检 → 实时监听 → 潜客识别 → 直播结束。')}</p></div><button className="lr-refresh" onClick={()=>void load()}><RefreshCw size={16}/>{txt('Actualiser','刷新')}</button></div>
    <div className="wl-summary"><div><b>{liveNow}</b><span>{txt('LIVE maintenant','正在直播')}</span></div><div><b>{leadsNow}</b><span>{txt('LIVE avec prospects','产生潜客')}</span></div><div><b>{comments}</b><span>{txt('Commentaires vus','监听评论')}</span></div><div><b>{prospects}</b><span>{txt('Prospects créés','进入潜客池')}</span></div></div>
    <div className="wl-grid">{loading?<div className="empty">{txt('Chargement…','加载中…')}</div>:ordered.length===0?<div className="empty">{txt("Aucun état LIVE pour l'instant.",'暂无直播状态数据。')}</div>:ordered.map(r=>{const a=accountMap.get(r.watchlist_id);return <article key={r.watchlist_id} className={`wl-card live-watch-card ${r.status}`}><div className="wl-card-top"><div><strong>@{a?.username||'—'}</strong><small>{a?.display_name||'—'}</small></div><span className={`live-state ${r.status}`}>{r.status==='lead_detected'?<Flame size={13}/>:<Radio size={13}/>} {statusLabel(r.status)}</span></div><div className="wl-meta"><span><Clock3 size={14}/> {fmtTime(r.live_started_at)}</span><span><Activity size={14}/> {duration(r.live_started_at,r.live_ended_at)}</span></div><div className="live-watch-stats"><span><MessageCircle size={14}/><b>{r.comments_seen}</b>{txt(' commentaires',' 条评论')}</span><span><Flame size={14}/><b>{r.candidates_found}</b>{txt(' intentions',' 个意向')}</span><span><b>{r.leads_inserted}</b>{txt(' prospects',' 个潜客')}</span></div>{r.last_comment_at&&<small>{txt('Dernier commentaire','最后评论')} {fmtTime(r.last_comment_at)}</small>}{r.last_error&&<small className="error-text">{r.last_error}</small>}</article>})}</div>
  </section>
}
