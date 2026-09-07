import { useEffect, useMemo, useState } from 'react'
import { Activity, AlertTriangle, BarChart3, Flame, Radio, Video } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Lang, Role } from '../lib/modules'

type Run={id:string;channel:'live'|'video_comment';provider:string|null;started_at:string;completed_at:string|null;items_seen:number;candidates_found:number;inserted_count:number;error:string|null}
type Lead={intent_score:number;source_type:'live'|'video_comment';status:string;created_at:string}

export default function TikTokRadarPilotMetrics({lang,role}:{lang:Lang;role:Role}){
  const txt=(fr:string,zh:string)=>lang==='fr'?fr:zh
  const canRead=role==='owner'||role==='manager'
  const [runs,setRuns]=useState<Run[]>([]),[leads,setLeads]=useState<Lead[]>([])
  const load=async()=>{if(!supabase||!canRead)return;const since=new Date(Date.now()-7*86400000).toISOString();const[{data:r},{data:l}]=await Promise.all([supabase.from('tiktok_radar_scan_runs').select('*').gte('started_at',since).order('started_at',{ascending:false}).limit(1000),supabase.from('social_leads').select('intent_score,source_type,status,created_at').eq('market_scope','abidjan_auto').gte('created_at',since)]);setRuns((r||[]) as Run[]);setLeads((l||[]) as Lead[])}
  useEffect(()=>{void load();if(!canRead)return;const t=setInterval(()=>void load(),30000);return()=>clearInterval(t)},[canRead])
  const m=useMemo(()=>{const seen=runs.reduce((a,x)=>a+(x.items_seen||0),0);const candidates=runs.reduce((a,x)=>a+(x.candidates_found||0),0);const inserted=runs.reduce((a,x)=>a+(x.inserted_count||0),0);const errors=runs.filter(x=>x.error).length;const hot=leads.filter(x=>x.intent_score>=80).length;const live=leads.filter(x=>x.source_type==='live').length;const video=leads.filter(x=>x.source_type==='video_comment').length;return{seen,candidates,inserted,errors,hot,live,video,rate:seen?Math.round(candidates/seen*1000)/10:0}},[runs,leads])
  if(!canRead)return null
  return <div className="pilot-panel">
    <div className="wl-head"><div><span className="eyebrow">V0.4 · 7 DAY PILOT</span><h2>{txt('Tableau de test réel','真实试跑数据')}</h2><p>{txt('Mesure le volume brut, les signaux retenus, les leads insérés et le taux de filtrage sur 7 jours.','统计最近7天原始评论、候选意向、写入潜客和筛选比例。')}</p></div></div>
    <div className="pilot-metrics"><Metric icon={<Activity/>} n={m.seen} label={txt('Commentaires vus','扫描评论')}/><Metric icon={<BarChart3/>} n={m.candidates} label={txt('Signaux retenus','候选意向')}/><Metric icon={<Flame/>} n={m.hot} label={txt('Leads A','A级潜客')}/><Metric icon={<Radio/>} n={m.live} label="LIVE"/><Metric icon={<Video/>} n={m.video} label={txt('Commentaires vidéo','视频评论')}/><Metric icon={<AlertTriangle/>} n={m.errors} label={txt('Erreurs','错误')}/></div>
    <div className="pilot-funnel"><div><span>{txt('Taux de sélection','意向筛选率')}</span><b>{m.rate}%</b></div><div><span>{txt('Prospects écrits','写入Lead Radar')}</span><b>{m.inserted}</b></div><div><span>{txt('Scans exécutés','执行扫描')}</span><b>{runs.length}</b></div></div>
  </div>
}
function Metric({icon,n,label}:{icon:React.ReactNode;n:number;label:string}){return <div className="pilot-metric"><span>{icon}</span><div><b>{n}</b><small>{label}</small></div></div>}
