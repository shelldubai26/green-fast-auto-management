import { useEffect, useMemo, useState } from 'react'
import { Activity, Bot, Flame, MessageCircle, Phone, Play, Radio, Target, Timer, UserRoundCheck, Users, Zap } from 'lucide-react'
import type { Lang, Role } from '../lib/modules'
import { calculateLiveScores, getDirectorAdvice, scoreIntent } from '../lib/liveSalesAI'
import '../live-sales-ai.css'

type Props={lang:Lang;role:Role;userId:string;onOpenCrm?:()=>void}
type LiveState={viewers:number;peak:number;avgWatchSeconds:number;commentsPerMinute:number;leads:number;hotLeads:number;appointments:number}
type Comment={id:number;user:string;text:string;intent:number;tag:string}

const rawSeed=[
 {id:1,user:'@marc225',text:'Le CS55 est disponible maintenant ?'},
 {id:2,user:'@aicha_ci',text:'Possibilité de crédit ?'},
 {id:3,user:'@sergeabj',text:'Prix final du CS75 ?'},
 {id:4,user:'@djeneba',text:'Vous êtes où à Abidjan ?'},
 {id:5,user:'@yannick',text:'Je veux faire un essai demain'},
]
const seed:Comment[]=rawSeed.map(c=>{const r=scoreIntent(c.text);return {...c,intent:r.score,tag:r.tags[0]}})

export default function LiveSalesAI({lang,onOpenCrm}:Props){
 const zh=lang==='zh'
 const [running,setRunning]=useState(false)
 const [state,setState]=useState<LiveState>({viewers:126,peak:173,avgWatchSeconds:48,commentsPerMinute:8.4,leads:14,hotLeads:5,appointments:2})
 const [comments]=useState(seed)
 const scores=useMemo(()=>calculateLiveScores(state),[state])
 const advice=useMemo(()=>getDirectorAdvice(scores),[scores])

 useEffect(()=>{
  if(!running)return
  const id=window.setInterval(()=>setState(s=>{
   const viewerDelta=Math.round(Math.random()*12-3)
   const viewers=Math.max(12,s.viewers+viewerDelta)
   const avgWatchSeconds=Math.max(20,Math.min(95,s.avgWatchSeconds+Math.round(Math.random()*8-3)))
   const commentsPerMinute=Math.max(1,Math.min(18,+(s.commentsPerMinute+(Math.random()*2.2-.7)).toFixed(1)))
   const leadGain=Math.random()>.48?1:0
   const hotGain=leadGain&&Math.random()>.62?1:0
   const appointmentGain=hotGain&&Math.random()>.82?1:0
   return {...s,viewers,peak:Math.max(s.peak,viewers),avgWatchSeconds,commentsPerMinute,leads:s.leads+leadGain,hotLeads:s.hotLeads+hotGain,appointments:s.appointments+appointmentGain}
  }),2500)
  return()=>window.clearInterval(id)
 },[running])

 const adviceLabel=advice.action.split('_').join(' ')
 const toggleDemo=()=>setRunning(v=>!v)
 return <main className="lsa-page">
  <section className="lsa-hero">
   <div><span className="lsa-eyebrow"><Radio size={14}/> LIVE SALES AI • V0.1.1</span><h1>{zh?'直播销售AI驾驶舱':'Cockpit IA de vente LIVE'}</h1><p>{zh?'实时诊断直播间：进人、留存、互动、意向、留资、预约。':'Diagnostiquer en direct : trafic, rétention, interaction, intention, leads et rendez-vous.'}</p></div>
   <button className={running?'lsa-live active':'lsa-live'} onClick={toggleDemo}><Play size={16}/>{running?(zh?'暂停模拟':'PAUSE DÉMO'):(zh?'启动模拟直播':'DÉMARRER LA DÉMO')}</button>
  </section>

  <section className="lsa-score-row">
   <div className="lsa-total"><div className="lsa-ring"><strong>{scores.total}</strong><small>/100</small></div><div><b>LIVE SCORE</b><span>{scores.total>=80?(zh?'状态优秀':'Excellent'):scores.total>=65?(zh?'可优化':'À optimiser'):(zh?'需要干预':'Intervention')}</span></div></div>
   {[['Traffic',scores.traffic,Users],['Retention',scores.retention,Timer],['Interaction',scores.interaction,MessageCircle],['Intent',scores.intent,Flame],['Lead Capture',scores.capture,Target]].map(([name,val,Icon]:any)=><div className="lsa-mini" key={name}><Icon size={18}/><span>{name}</span><strong>{val}</strong><i><em style={{width:`${val}%`}}/></i></div>)}
  </section>

  <section className="lsa-grid">
   <div className="lsa-panel lsa-director"><header><div><Bot/><b>AI DIRECTOR</b></div><span>{zh?'下一步动作':'NEXT ACTION'}</span></header><div className="lsa-alert"><Zap/><div><b>{adviceLabel}</b><p>{zh?advice.scriptZh:advice.scriptFr}</p></div></div><div className="lsa-script"><small>{zh?'主播建议话术':'SCRIPT CONSEILLÉ'}</small><p>“{zh?advice.scriptZh:advice.scriptFr}”</p></div><div className="lsa-actions"><button>{zh?'已执行':'EXÉCUTÉ'}</button><button>{zh?'继续观察':'MESURER'}</button></div></div>

   <div className="lsa-panel"><header><div><Activity/><b>{zh?'实时指标':'LIVE METRICS'}</b></div><span className="lsa-dot">{running?'LIVE':'DEMO'}</span></header><div className="lsa-metrics">
    <Metric icon={<Users/>} value={state.viewers} label={zh?'当前在线':'En direct'}/><Metric icon={<Zap/>} value={state.peak} label={zh?'最高在线':'Pic'}/><Metric icon={<Timer/>} value={`${state.avgWatchSeconds}s`} label={zh?'平均观看':'Temps moyen'}/><Metric icon={<MessageCircle/>} value={`${state.commentsPerMinute}/m`} label={zh?'评论速度':'Commentaires'}/><Metric icon={<UserRoundCheck/>} value={state.leads} label={zh?'留资':'Leads'}/><Metric icon={<Phone/>} value={state.appointments} label={zh?'预约':'RDV'}/>
   </div></div>

   <div className="lsa-panel lsa-radar"><header><div><Flame/><b>INTENT RADAR</b></div><span>{state.hotLeads} HOT</span></header><div className="lsa-comments">{comments.map(c=><div className="lsa-comment" key={c.id}><div className="lsa-avatar">{c.user.slice(1,3).toUpperCase()}</div><div className="lsa-comment-copy"><b>{c.user}</b><p>{c.text}</p><span>{c.tag}</span></div><div className={c.intent>=85?'lsa-intent hot':'lsa-intent'}><strong>{c.intent}</strong><small>/100</small></div></div>)}</div></div>

   <div className="lsa-panel"><header><div><Target/><b>{zh?'销售漏斗':'SALES FUNNEL'}</b></div><span>TikTok LIVE</span></header><div className="lsa-funnel">{[
    [zh?'当前在线':'En direct',state.viewers],[zh?'互动/分钟':'Interactions/min',Math.round(state.commentsPerMinute)],[zh?'留资':'Leads',state.leads],[zh?'A类':'Leads A',state.hotLeads],[zh?'预约':'RDV',state.appointments]
   ].map(([n,v],i)=><div key={String(n)}><span>{n}</span><strong>{v}</strong><i style={{width:`${Math.max(34,100-i*14)}%`}}/></div>)}</div><button className="lsa-crm" onClick={onOpenCrm}>{zh?'打开CRM跟进高意向客户':'OUVRIR LES HOT LEADS DANS LE CRM'}</button></div>
  </section>

  <section className="lsa-architecture"><h2>{zh?'V0.1系统架构':'Architecture V0.1'}</h2><div>{['TikTok / LIVE data','Event Normalizer','Live Score Engine','AI Director','Intent Scoring','Lead Router','Green Fast CRM','Post-LIVE Review'].map((x,i)=><span key={x}>{i+1}<b>{x}</b></span>)}</div></section>
 </main>
}

function Metric({icon,value,label}:{icon:React.ReactNode;value:string|number;label:string}){return <div className="lsa-metric"><span>{icon}</span><strong>{value}</strong><small>{label}</small></div>}
