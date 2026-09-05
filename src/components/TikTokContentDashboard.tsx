import { useEffect,useMemo,useState } from 'react'
import { BarChart3,Eye,Heart,MessageCircle,Share2,Users,Video } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Lang } from '../lib/modules'
import '../live-sales-ai.css'

type VideoRow={profile_id:string;video_id:string;title:string|null;video_description:string|null;cover_image_url:string|null;create_time:string|null;view_count:number|null;like_count:number|null;comment_count:number|null;share_count:number|null}
type AccountRow={profile_id:string;display_name:string|null;username:string|null}
type ProfileRow={id:string;full_name:string|null;role:string;manager_scope?:string|null}
const n=(v:number)=>new Intl.NumberFormat('en-US',{notation:v>=10000?'compact':'standard',maximumFractionDigits:1}).format(v)
const iso=(d:Date)=>d.toISOString().slice(0,10)

export default function TikTokContentDashboard({lang}:{lang:Lang}){
 const zh=lang==='zh'; const now=new Date(); const [start,setStart]=useState(iso(new Date(now.getFullYear(),now.getMonth(),1))),[end,setEnd]=useState(iso(now)),[videos,setVideos]=useState<VideoRow[]>([]),[accounts,setAccounts]=useState<AccountRow[]>([]),[profiles,setProfiles]=useState<ProfileRow[]>([]),[me,setMe]=useState<ProfileRow|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('')
 const load=async()=>{try{setLoading(true);setError('');if(!supabase)throw new Error('Supabase not configured');const {data:{user}}=await supabase.auth.getUser();if(!user)throw new Error(zh?'请先登录':'Connexion requise');const [{data:p},{data:a},{data:v},{data:self}]=await Promise.all([supabase.from('profiles').select('id,full_name,role,manager_scope').eq('active',true),supabase.from('tiktok_accounts').select('profile_id,display_name,username').eq('token_status','connected'),supabase.from('tiktok_videos').select('profile_id,video_id,title,video_description,cover_image_url,create_time,view_count,like_count,comment_count,share_count').gte('create_time',`${start}T00:00:00Z`).lte('create_time',`${end}T23:59:59Z`).order('view_count',{ascending:false}),supabase.from('profiles').select('id,full_name,role,manager_scope').eq('id',user.id).maybeSingle()]);setProfiles((p||[]) as ProfileRow[]);setAccounts((a||[]) as AccountRow[]);setVideos((v||[]) as VideoRow[]);setMe(self as ProfileRow|null)}catch(e:any){setError(e?.message||String(e))}finally{setLoading(false)}}
 useEffect(()=>{void load()},[start,end])
 const profileName=(id:string)=>profiles.find(p=>p.id===id)?.full_name||accounts.find(a=>a.profile_id===id)?.display_name||'—'
 const stats=useMemo(()=>videos.reduce((a,v)=>({videos:a.videos+1,views:a.views+(v.view_count||0),likes:a.likes+(v.like_count||0),comments:a.comments+(v.comment_count||0),shares:a.shares+(v.share_count||0)}),{videos:0,views:0,likes:0,comments:0,shares:0}),[videos])
 const sellers=useMemo(()=>accounts.map(a=>{const vs=videos.filter(v=>v.profile_id===a.profile_id);return {id:a.profile_id,name:profileName(a.profile_id),videos:vs.length,views:vs.reduce((s,v)=>s+(v.view_count||0),0),likes:vs.reduce((s,v)=>s+(v.like_count||0),0)}}).sort((a,b)=>b.views-a.views),[accounts,videos,profiles])
 const scope=me?.role==='owner'||(me?.role==='manager'&&me?.manager_scope==='store')?(zh?'全店':'Toute l’équipe'):me?.role==='manager'?(zh?'我的销售组':'Mon équipe'):(zh?'仅我自己':'Moi uniquement')
 return <section className="lsa-content-dashboard">
  <header><div><span className="lsa-eyebrow"><BarChart3 size={14}/> TIKTOK CONTENT</span><h3>{zh?'内容经营仪表盘':'Tableau de performance contenu'}</h3><p>{zh?`可见范围：${scope}`:`Périmètre visible : ${scope}`}</p></div><div className="lsa-content-range"><input type="date" value={start} max={end} onChange={e=>setStart(e.target.value)}/><span>→</span><input type="date" value={end} min={start} max={iso(now)} onChange={e=>setEnd(e.target.value)}/></div></header>
  {error&&<div className="lpr-error">{error}</div>}
  <div className="lsa-content-kpis">{[[Video,zh?'视频':'Vidéos',stats.videos],[Eye,zh?'播放':'Vues',stats.views],[Heart,zh?'点赞':'J’aime',stats.likes],[MessageCircle,zh?'评论':'Commentaires',stats.comments],[Share2,zh?'分享':'Partages',stats.shares],[Users,zh?'已连接员工':'Comptes',accounts.length]].map(([I,label,val]:any)=><article key={label}><I size={17}/><small>{label}</small><strong>{n(Number(val))}</strong></article>)}</div>
  <div className="lsa-content-grid"><div className="lsa-content-panel"><header><b>{zh?'员工表现':'Performance vendeurs'}</b><small>{zh?'按播放量排序':'Trié par vues'}</small></header>{sellers.length?sellers.slice(0,8).map((s,i)=><div className="lsa-seller-row" key={s.id}><span>{i+1}</span><div><b>{s.name}</b><small>{s.videos}{zh?'条视频':' vidéos'}</small></div><strong>{n(s.views)}</strong></div>):<p className="lsa-empty">{zh?'暂无可见员工数据':'Aucune donnée visible'}</p>}</div>
  <div className="lsa-content-panel"><header><b>{zh?'TOP 视频':'TOP vidéos'}</b><small>{zh?'当前时间区间':'Période sélectionnée'}</small></header>{videos.length?videos.slice(0,5).map((v,i)=><div className="lsa-video-row" key={v.video_id}><span>{i+1}</span><div><b>{v.title||v.video_description||zh?'未命名视频':'Vidéo sans titre'}</b><small>{profileName(v.profile_id)} · {v.create_time?new Date(v.create_time).toLocaleDateString():''}</small></div><strong>{n(v.view_count||0)}</strong></div>):<p className="lsa-empty">{loading?(zh?'加载中…':'Chargement…'):(zh?'该区间暂无视频':'Aucune vidéo sur cette période')}</p>}</div></div>
 </section>
}
