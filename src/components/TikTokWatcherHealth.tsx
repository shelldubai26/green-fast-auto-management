import { useEffect, useMemo, useState } from 'react'
import { Activity, AlertTriangle, KeyRound, Radio, Video } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Lang, Role } from '../lib/modules'
import './TikTokWatcherHealth.css'

type StateRow={
  id:string
  channel:'live'|'video_comment'
  provider:string|null
  live_status:boolean|null
  last_checked_at:string|null
  last_success_at:string|null
  last_error:string|null
  last_items_seen:number
  last_candidates_found?:number
  last_inserted_count?:number
  consecutive_errors?:number
  last_outcome?:string|null
}

export default function TikTokWatcherHealth({lang,role}:{lang:Lang;role:Role}){
  const txt=(fr:string,zh:string)=>lang==='fr'?fr:zh
  const [rows,setRows]=useState<StateRow[]>([])
  const canRead=role==='owner'||role==='manager'
  const load=async()=>{if(!supabase||!canRead)return;const{data}=await supabase.from('tiktok_watcher_state').select('*').order('last_checked_at',{ascending:false}).limit(200);setRows((data||[]) as StateRow[])}
  useEffect(()=>{void load();if(!canRead)return;const t=setInterval(()=>void load(),30000);return()=>clearInterval(t)},[canRead])
  const stats=useMemo(()=>({
    live:rows.filter(x=>x.channel==='live'&&x.live_status).length,
    errors:rows.filter(x=>(x.consecutive_errors||0)>0).length,
    providerAuth:rows.filter(x=>x.last_outcome==='provider_auth_required'||x.last_outcome==='provider_auth_or_quota_error').length,
    providerMissing:rows.filter(x=>x.last_outcome==='provider_missing').length,
    items:rows.reduce((a,x)=>a+(x.last_items_seen||0),0),
    candidates:rows.reduce((a,x)=>a+(x.last_candidates_found||0),0),
    newLeads:rows.reduce((a,x)=>a+(x.last_inserted_count||0),0),
  }),[rows])
  if(!canRead)return null
  return <div className="watcher-health">
    <div><Activity size={16}/><span>{txt('Watcher Engine','抓取引擎')}</span><b>{rows.length?txt('Actif · V0.5.1','运行中 · V0.5.1'):txt('En attente','待启动')}</b></div>
    <div><Radio size={15}/><span>{txt('LIVE actifs','直播在线')}</span><b>{stats.live}</b></div>
    <div><Video size={15}/><span>{txt('Commentaires vus','最近评论')}</span><b>{stats.items}</b></div>
    <div><Activity size={15}/><span>{txt('Signaux achat','购买意向')}</span><b>{stats.candidates}</b></div>
    <div><Activity size={15}/><span>{txt('Nouveaux prospects','新增潜客')}</span><b>{stats.newLeads}</b></div>
    <div className={stats.providerAuth?'health-error':''}><KeyRound size={15}/><span>{txt('Clé LIVE requise','LIVE密钥待配置')}</span><b>{stats.providerAuth}</b></div>
    <div className={stats.providerMissing?'health-error':''}><Video size={15}/><span>{txt('Provider vidéo manquant','视频源待接入')}</span><b>{stats.providerMissing}</b></div>
    <div className={stats.errors?'health-error':''}><AlertTriangle size={15}/><span>{txt('Sources en erreur','异常源')}</span><b>{stats.errors}</b></div>
  </div>
}
