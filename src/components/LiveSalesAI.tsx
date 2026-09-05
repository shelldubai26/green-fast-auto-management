import { useMemo, useState } from 'react'
import { Activity, Bot, Flame, MessageCircle, Phone, Play, Radio, Target, Timer, UserRoundCheck, Users, Zap } from 'lucide-react'
import type { Lang, Role } from '../lib/modules'
import '../live-sales-ai.css'

type Props={lang:Lang;role:Role;userId:string}
type LiveState={viewers:number;peak:number;avgWatch:number;commentsPerMin:number;leads:number;hotLeads:number;appointments:number}
type Comment={id:number;user:string;text:string;intent:number;tag:string}

const seed:Comment[]=[
{id:1,user:'@marc225',text:'Le CS55 est disponible maintenant ?',intent:88,tag:'STOCK'},
{id:2,user:'@aicha_ci',text:'Possibilité de crédit ?',intent:91,tag:'FINANCEMENT'},
{id:3,user:'@sergeabj',text:'Prix final du CS75 ?',intent:84,tag:'PRIX'},
{id:4,user:'@djeneba',text:'Vous êtes où à Abidjan ?',intent:76,tag:'LOCALISATION'},
{id:5,user:'@yannick',text:'Je veux faire un essai demain',intent:96,tag:'ESSAI'},
]

function score(s:LiveState){
 const traffic=Math.min(100,Math.round((s.viewers/180)*100))
 const retention=Math.min(100,Math.round((s.avgWatch/75)*100))
 const interaction=Math.min(100,Math.round((s.commentsPerMin/12)*100))
 const intent=Math.min(100,Math.round((s.hotLeads/Math.max(1,s.leads))*100))
 const capture=Math.min(100,Math.round((s.leads/Math.max(1,s.viewers))*100*8))
 const total=Math.round(traffic*.2+retention*.25+interaction*.2+intent*.2+capture*.15)
 return {traffic,retention,interaction,intent,capture,total}
}

export default function LiveSalesAI({lang}:Props){
 const zh=lang==='zh'
 const [running,setRunning]=useState(false)
 const [state,setState]=useState<LiveState>({viewers:126,peak:173,avgWatch:48,commentsPerMin:8.4,leads:14,hotLeads:5,appointments:2})
 const [comments]=useState(seed)
 const scores=useMemo(()=>score(state),[state])
 const weak=Object.entries(scores).filter(([k])=>k!=='total').sort((a,b)=>Number(a[1])-Number(b[1]))[0]?.[0]
 const advice=weak==='retention'?{type:'RETENTION DOWN',fr:'Arrêtez les caractéristiques. Ouvrez le coffre du CS55 et posez une question famille.',zh:'停止讲参数。马上打开CS55后备箱，并抛出家庭用车问题。',script:'Si vous avez une famille, regardez la taille réelle du coffre…'}:weak==='capture'?{type:'LEAD CAPTURE LOW',fr:'Faites un CTA WhatsApp maintenant. Donnez une raison claire de laisser un contact.',zh:'现在立刻做WhatsApp留资CTA，并给客户一个明确留下联系方式的理由。',script:'Prix final + disponibilité : envoyez LIVE + CS55 au 07 00 73 71 18.'}:{type:'INTERACTION LOW',fr:'Lancez un choix simple : CS55 ou CS75 ?',zh:'发起简单二选一互动：CS55还是CS75？',script:'CS55 à 19M ou CS75 à 22M ? Écrivez 55 ou 75.'}
 const simulate=()=>{setRunning(v=>!v);if(!running)setState(s=>({...s,viewers:s.viewers+12,peak:Math.max(s.peak,s.viewers+12),commentsPerMin:+(s.commentsPerMin+1.3).toFixed(1),leads:s.leads+2,hotLeads:s.hotLeads+1}))}
 return <main className="lsa-page">
  <section className="lsa-hero">
   <div><span className="lsa-eyebrow"><Radio size={14}/> LIVE SALES AI • V0.1</span><h1>{zh?'直播销售AI驾驶舱':'Cockpit IA de vente LIVE'}</h1><p>{zh?'实时诊断直播间：进人、留存、互动、意向、留资、预约。':'Diagnostiquer en direct : trafic, rétention, interaction, intention, leads et rendez-vous.'}</p></div>
   <button className={running?'lsa-live active':'lsa-live'} onClick={simulate}><Play size={16}/>{running?(zh?'直播监控中':'LIVE MONITORING'):(zh?'启动演示':'DÉMARRER LA DÉMO')}</button>
  </section>

  <section className="lsa-score-row">
   <div className="lsa-total"><div className="lsa-ring"><strong>{scores.total}</strong><small>/100</small></div><div><b>LIVE SCORE</b><span>{scores.total>=80?(zh?'状态优秀':'Excellent'):scores.total>=65?(zh?'可优化':'À optimiser'):(zh?'需要干预':'Intervention')}</span></div></div>
   {[['Traffic',scores.traffic,Users],['Retention',scores.retention,Timer],['Interaction',scores.interaction,MessageCircle],['Intent',scores.intent,Flame],['Lead Capture',scores.capture,Target]].map(([name,val,Icon]:any)=><div className="lsa-mini" key={name}><Icon size={18}/><span>{name}</span><strong>{val}</strong><i><em style={{width:`${val}%`}}/></i></div>)}
  </section>

  <section className="lsa-grid">
   <div className="lsa-panel lsa-director"><header><div><Bot/><b>AI DIRECTOR</b></div><span>{zh?'下一步动作':'NEXT ACTION'}</span></header><div className="lsa-alert"><Zap/><div><b>{advice.type}</b><p>{zh?advice.zh:advice.fr}</p></div></div><div className="lsa-script"><small>{zh?'主播建议话术':'SCRIPT CONSEILLÉ'}</small><p>“{advice.script}”</p></div><div className="lsa-actions"><button>{zh?'已执行':'EXÉCUTÉ'}</button><button>{zh?'换一个建议':'AUTRE ACTION'}</button></div></div>

   <div className="lsa-panel"><header><div><Activity/><b>{zh?'实时指标':'LIVE METRICS'}</b></div><span className="lsa-dot">LIVE</span></header><div className="lsa-metrics">
    <Metric icon={<Users/>} value={state.viewers} label={zh?'当前在线':'En direct'}/><Metric icon={<Zap/>} value={state.peak} label={zh?'最高在线':'Pic'}/><Metric icon={<Timer/>} value={`${state.avgWatch}s`} label={zh?'平均观看':'Temps moyen'}/><Metric icon={<MessageCircle/>} value={`${state.commentsPerMin}/m`} label={zh?'评论速度':'Commentaires'}/><Metric icon={<UserRoundCheck/>} value={state.leads} label={zh?'留资':'Leads'}/><Metric icon={<Phone/>} value={state.appointments} label={zh?'预约':'RDV'}/>
   </div></div>

   <div className="lsa-panel lsa-radar"><header><div><Flame/><b>INTENT RADAR</b></div><span>{state.hotLeads} HOT</span></header><div className="lsa-comments">{comments.map(c=><div className="lsa-comment" key={c.id}><div className="lsa-avatar">{c.user.slice(1,3).toUpperCase()}</div><div className="lsa-comment-copy"><b>{c.user}</b><p>{c.text}</p><span>{c.tag}</span></div><div className={c.intent>=90?'lsa-intent hot':'lsa-intent'}><strong>{c.intent}</strong><small>/100</small></div></div>)}</div></div>

   <div className="lsa-panel"><header><div><Target/><b>{zh?'销售漏斗':'SALES FUNNEL'}</b></div><span>TikTok LIVE</span></header><div className="lsa-funnel">{[
    [zh?'观看':'Vues',126],[zh?'互动':'Interactions',58],[zh?'留资':'Leads',14],[zh?'A类':'Leads A',5],[zh?'预约':'RDV',2],[zh?'到店':'Visites',1]
   ].map(([n,v],i)=><div key={String(n)}><span>{n}</span><strong>{v}</strong><i style={{width:`${100-i*12}%`}}/></div>)}</div><button className="lsa-crm">{zh?'打开CRM跟进高意向客户':'OUVRIR LES HOT LEADS DANS LE CRM'}</button></div>
  </section>

  <section className="lsa-architecture"><h2>{zh?'V0.1系统架构':'Architecture V0.1'}</h2><div>{['TikTok / LIVE data','Event Normalizer','Live Score Engine','AI Director','Intent Scoring','Lead Router','Green Fast CRM','Post-LIVE Review'].map((x,i)=><span key={x}>{i+1}<b>{x}</b></span>)}</div></section>
 </main>
}

function Metric({icon,value,label}:{icon:React.ReactNode;value:string|number;label:string}){return <div className="lsa-metric"><span>{icon}</span><strong>{value}</strong><small>{label}</small></div>}
