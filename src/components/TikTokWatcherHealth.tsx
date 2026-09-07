import { useEffect, useMemo, useState } from 'react'
import { Activity, AlertTriangle, Radio, Video } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Lang, Role } from '../lib/modules'
import './TikTokWatcherHealth.css'

type StateRow={id:string;channel:'live'|'video_comment';provider:string|null;live_status:boolean|null;last_checked_at:string|null;last_success_at:string|null;last_error:string|null;last_items_seen:number}

export default function TikTokWatcherHealth({lang,role}:{lang:Lang;role:Role}){
  const txt=(fr:string,zh:string)=>lang==='fr'?fr:zh
  const [rows,setRows]=useState<StateRow[]>([])
  const canRead=role==='owner'||role==='manager'
  const load=async()=>{if(!supabase||!canRead)return;const{data}=await supabase.from('tiktok_watcher_state').select('*').order('last_checked_at',{ascending:false}).limit(200);setRows((data||[]) as StateRow[])}
  useEffect(()=>{void load();if(!canRead)return;const t=setInterval(()=>void load(),30000);return()=>clearInterval(t)},[canRead])
  const stats=useMemo(()=>({live:rows.filter(x=>x.channel==='live'&&x.live_status).length,ok:rows.filter(x=>x.last_success_at&&!x.last_error).length,errors:rows.filter(x=>x.last_error).length,items:rows.reduce((a,x)=>a+(x.last_items_seen||0),0)}),[rows])
  if(!canRead)return null
  return <div className="watcher-health"><div><Activity size={16}/><span>{txt('Watcher Engine','抓取引擎')}</span><b>{rows.length?txt('Actif','运行中'):txt('En attente','待启动')}</b></div><div><Radio size={15}/><span>{txt('LIVE actifs','直播在线')}</span><b>{stats.live}</b></div><div><Video size={15}/><span>{txt('Signaux dernier scan','最近抓取')}</span><b>{stats.items}</b></div><div className={stats.errors?'health-error':''}><AlertTriangle size={15}/><span>{txt('Erreurs','错误')}</span><b>{stats.errors}</b></div></div>
}
