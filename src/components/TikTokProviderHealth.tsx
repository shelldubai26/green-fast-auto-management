import { useEffect, useState } from 'react'
import { CheckCircle2, KeyRound, Radio, Video, XCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Lang, Role } from '../lib/modules'

type Row={provider_key:string;provider_name:string;channel:'live'|'video_comment';enabled:boolean;ready:boolean;status:string;last_checked_at:string|null;last_error:string|null}

export default function TikTokProviderHealth({lang,role}:{lang:Lang;role:Role}){
  const [rows,setRows]=useState<Row[]>([])
  const canRead=role==='owner'||role==='manager'
  const txt=(fr:string,zh:string)=>lang==='fr'?fr:zh
  const load=async()=>{if(!supabase||!canRead)return;const{data}=await supabase.from('tiktok_radar_provider_health').select('*').order('provider_key');setRows((data||[]) as Row[])}
  useEffect(()=>{void load();if(!canRead)return;const t=setInterval(()=>void load(),30000);return()=>clearInterval(t)},[canRead])
  if(!canRead||!rows.length)return null
  const label=(r:Row)=>{
    if(r.ready)return txt('Prêt','已就绪')
    if(r.status==='missing_api_key')return txt('Clé API requise','需要 API Key')
    if(r.status==='not_configured')return txt('À connecter','待接入')
    return txt('À vérifier','需检查')
  }
  return <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:10,margin:'10px 0 18px'}}>
    {rows.map(r=><div key={r.provider_key} style={{border:'1px solid var(--border,#e5e7eb)',borderRadius:14,padding:14,background:'var(--card,#fff)'}}>
      <div style={{display:'flex',alignItems:'center',gap:8}}>{r.channel==='live'?<Radio size={17}/>:<Video size={17}/>}<strong>{r.provider_name}</strong></div>
      <div style={{display:'flex',alignItems:'center',gap:7,marginTop:8,fontSize:13}}>{r.ready?<CheckCircle2 size={15}/>:r.status==='missing_api_key'?<KeyRound size={15}/>:<XCircle size={15}/>}<span>{label(r)}</span></div>
      {!r.ready&&<small style={{display:'block',marginTop:6,opacity:.7}}>{r.status==='missing_api_key'?txt('Configurer EULER_SIGN_API_KEY dans Railway.','在 Railway 配置 EULER_SIGN_API_KEY。'):txt('Configurer le fournisseur de commentaires vidéo.','配置视频评论数据 Provider。')}</small>}
    </div>)}
  </div>
}
