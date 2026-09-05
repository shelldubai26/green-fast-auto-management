import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, Bot, Check, Flame, MessageCircle, Phone, Play, Radio, Target, Timer, UserRoundCheck, Users, Zap } from 'lucide-react'
import type { Lang, Role } from '../lib/modules'
import { calculateLiveScores, getDirectorAdvice, scoreIntent } from '../lib/liveSalesAI'
import { beginDirectorAction, completeDirectorAction, createLiveSession, endLiveSession, routeCommentToCrm, saveSnapshot, seedLiveComments } from '../lib/liveSalesData'
import '../live-sales-ai.css'

type Props={lang:Lang;role:Role;userId:string;onOpenCrm?:()=>void}
type LiveState={viewers:number;peak:number;avgWatchSeconds:number;commentsPerMinute:number;leads:number;hotLeads:number;appointments:number}
type Comment={id:number;user:string;text:string;intent:number;tag:string}
type ActionResult={liveScore:number;retention:number;interaction:number;intent:number;capture:number;leads:number;appointments:number}

const rawSeed=[
 {id:1,user:'@marc225',text:'Le CS55 est disponible maintenant ?'},
 {id:2,user:'@aicha_ci',text:'Possibilité de crédit ?'},
 {id:3,user:'@sergeabj',text:'Prix final du CS75 ?'},
 {id:4,user:'@djeneba',text:'Vous êtes où à Abidjan ?'},
 {id:5,user:'@yannick',text:'Je veux faire un essai demain'},
]
const seed:Comment[]=rawSeed.map(c=>{const r=scoreIntent(c.text);return {...c,intent:r.score,tag:r.tags[0]}})

export default function LiveSalesAI({lang,userId,onOpenCrm}:Props){
 const zh=lang==='zh'
 const [running,setRunning]=useState(false)
 const [sessionId,setSessionId]=useState<string|null>(null)
 const [status,setStatus]=useState('')
 const [routed,setRouted]=useState<number[]>([])
 const [routing,setRouting]=useState<number|null>(null)
 const [measuring,setMeasuring]=useState(false)
 const [actionResult,setActionResult]=useState<ActionResult|null>(null)
 const [state,setState]=useState<LiveState>({viewers:126,peak:173,avgWatchSeconds:48,commentsPerMinute:8.4,leads:14,hotLeads:5,appointments:2})
 const [comments]=useState(seed)
 const scores=useMemo(()=>calculateLiveScores(state),[state])
 const advice=useMemo(()=>getDirectorAdvice(scores),[scores])
 const stateRef=useRef(state)
 const scoresRef=useRef(scores)
 const actionTimer=useRef<number|null>(null)
 useEffect(()=>{stateRef.current=state},[state])
 useEffect(()=>{scoresRef.current=scores},[scores])
 useEffect(()=>()=>{if(actionTimer.current)window.clearTimeout(actionTimer.current)},[])

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

 useEffect(()=>{
  if(!running||!sessionId)return
  const persist=()=>void saveSnapshot(sessionId,stateRef.current,scoresRef.current).catch(e=>setStatus(String(e?.message||e)))
  persist()
  const id=window.setInterval(persist,10000)
  return()=>window.clearInterval(id)
 },[running,sessionId])

 const adviceLabel=advice.action.split('_').join(' ')
 const toggle=async()=>{
  if(running){setRunning(false);setStatus(zh?'已暂停监控':'Monitoring en pause');return}
  try{
   if(!sessionId){
    setStatus(zh?'正在创建直播 Session…':'Création de la session LIVE…')
    const id=await createLiveSession(userId)
    await seedLiveComments(id,comments)
    setSessionId(id)
    setRouted([])
    setActionResult(null)
    setStatus(zh?'Session 已连接数据库':'Session connectée à Supabase')
   }
   setRunning(true)
  }catch(e:any){setStatus(e?.message||String(e))}
 }
 const finish=async()=>{
  if(!sessionId)return
  try{
   await endLiveSession(sessionId,stateRef.current)
   setRunning(false)
   setSessionId(null)
   setMeasuring(false)
   if(actionTimer.current){window.clearTimeout(actionTimer.current);actionTimer.current=null}
   setStatus(zh?'本场直播已结束并保存，可开始新 Session':'Session terminée et enregistrée. Nouvelle session disponible.')
  }catch(e:any){setStatus(e?.message||String(e))}
 }
 const route=async(c:Comment)=>{
  if(!sessionId){setStatus(zh?'请先启动直播 Session':'Démarrez d’abord une session');return}
  setRouting(c.id)
  try{
   await routeCommentToCrm(sessionId,userId,c)
   setRouted(v=>[...v,c.id])
   setState(s=>({...s,leads:s.leads+1,hotLeads:s.hotLeads+(c.intent>=85?1:0)}))
   setStatus(zh?`${c.user} 已进入 Green Fast CRM`:`${c.user} envoyé dans le CRM Green Fast`)
  }catch(e:any){setStatus(e?.message||String(e))}finally{setRouting(null)}
 }
 const executeAdvice=async()=>{
  if(!sessionId){setStatus(zh?'请先启动直播 Session':'Démarrez d’abord une session');return}
  if(measuring)return
  const before={metrics:stateRef.current,scores:scoresRef.current}
  try{
   const actionId=await beginDirectorAction(sessionId,advice,before)
   setMeasuring(true);setActionResult(null)
   setStatus(zh?`AI动作已执行，正在观察 ${advice.measureForSeconds} 秒…`:`Action exécutée. Mesure pendant ${advice.measureForSeconds}s…`)
   actionTimer.current=window.setTimeout(()=>{
    const after={metrics:stateRef.current,scores:scoresRef.current}
    void completeDirectorAction(actionId,before,after).then(delta=>{
     if(delta)setActionResult(delta as ActionResult)
     setMeasuring(false);actionTimer.current=null
     setStatus(zh?'效果测量完成，已写入AI学习数据':'Mesure terminée et enregistrée pour l’apprentissage IA')
    }).catch(e=>{setMeasuring(false);setStatus(String(e?.message||e))})
   },advice.measureForSeconds*1000)
  }catch(e:any){setStatus(e?.message||String(e))}
 }

 return <main className="lsa-page">
  <section className="lsa-hero">
   <div><span className="lsa-eyebrow"><Radio size={14}/> LIVE SALES AI • V0.2.1</span><h1>{zh?'直播销售AI驾驶舱':'Cockpit IA de vente LIVE'}</h1><p>{zh?'开始记录“AI建议 → 主播执行 → 数据变化 → 销售结果”。':'Mesure maintenant : conseil IA → exécution → variation des données → résultat commercial.'}</p>{status&&<small className="lsa-status">{status}</small>}</div>
   <div className="lsa-top-actions"><button className={running?'lsa-live active':'lsa-live'} onClick={()=>void toggle()}><Play size={16}/>{running?(zh?'暂停监控':'PAUSE'):(zh?'启动直播 Session':'DÉMARRER SESSION')}</button>{sessionId&&<button className="lsa-finish" onClick={()=>void finish()}>{zh?'结束并保存':'TERMINER'}</button>}</div>
  </section>

  <section className="lsa-score-row">
   <div className="lsa-total"><div className="lsa-ring"><strong>{scores.total}</strong><small>/100</small></div><div><b>LIVE SCORE</b><span>{scores.total>=80?(zh?'状态优秀':'Excellent'):scores.total>=65?(zh?'可优化':'À optimiser'):(zh?'需要干预':'Intervention')}</span></div></div>
   {[['Traffic',scores.traffic,Users],['Retention',scores.retention,Timer],['Interaction',scores.interaction,MessageCircle],['Intent',scores.intent,Flame],['Lead Capture',scores.capture,Target]].map(([name,val,Icon]:any)=><div className="lsa-mini" key={name}><Icon size={18}/><span>{name}</span><strong>{val}</strong><i><em style={{width:`${val}%`}}/></i></div>)}
  </section>

  <section className="lsa-grid">
   <div className="lsa-panel lsa-director"><header><div><Bot/><b>AI DIRECTOR</b></div><span>{measuring?(zh?'效果测量中':'MEASURING'):(zh?'下一步动作':'NEXT ACTION')}</span></header><div className="lsa-alert"><Zap/><div><b>{adviceLabel}</b><p>{zh?advice.scriptZh:advice.scriptFr}</p></div></div><div className="lsa-script"><small>{zh?'主播建议话术':'SCRIPT CONSEILLÉ'}</small><p>“{zh?advice.scriptZh:advice.scriptFr}”</p></div><div className="lsa-actions"><button disabled={measuring} onClick={()=>void executeAdvice()}>{measuring?(zh?'测量中…':'MESURE…'):(zh?'执行并测量':'EXÉCUTER + MESURER')}</button><button>{advice.measureForSeconds}s</button></div>{actionResult&&<div className="lsa-result"><b>{zh?'本次动作效果':'IMPACT DE L’ACTION'}</b><span>LIVE SCORE {actionResult.liveScore>=0?'+':''}{actionResult.liveScore}</span><span>Retention {actionResult.retention>=0?'+':''}{actionResult.retention}</span><span>Interaction {actionResult.interaction>=0?'+':''}{actionResult.interaction}</span><span>Leads {actionResult.leads>=0?'+':''}{actionResult.leads}</span></div>}</div>

   <div className="lsa-panel"><header><div><Activity/><b>{zh?'实时指标':'LIVE METRICS'}</b></div><span className="lsa-dot">{running?'LIVE':sessionId?'PAUSE':'READY'}</span></header><div className="lsa-metrics"><Metric icon={<Users/>} value={state.viewers} label={zh?'当前在线':'En direct'}/><Metric icon={<Zap/>} value={state.peak} label={zh?'最高在线':'Pic'}/><Metric icon={<Timer/>} value={`${state.avgWatchSeconds}s`} label={zh?'平均观看':'Temps moyen'}/><Metric icon={<MessageCircle/>} value={`${state.commentsPerMinute}/m`} label={zh?'评论速度':'Commentaires'}/><Metric icon={<UserRoundCheck/>} value={state.leads} label={zh?'留资':'Leads'}/><Metric icon={<Phone/>} value={state.appointments} label={zh?'预约':'RDV'}/></div></div>

   <div className="lsa-panel lsa-radar"><header><div><Flame/><b>INTENT RADAR</b></div><span>{state.hotLeads} HOT</span></header><div className="lsa-comments">{comments.map(c=>{const done=routed.includes(c.id);return <div className="lsa-comment" key={c.id}><div className="lsa-avatar">{c.user.slice(1,3).toUpperCase()}</div><div className="lsa-comment-copy"><b>{c.user}</b><p>{c.text}</p><span>{c.tag}</span></div><div className={c.intent>=85?'lsa-intent hot':'lsa-intent'}><strong>{c.intent}</strong><small>/100</small><button className={done?'lsa-route done':'lsa-route'} disabled={done||routing===c.id} onClick={()=>void route(c)}>{done?<><Check size={12}/>{zh?'已入CRM':'CRM'}</>:routing===c.id?'…':zh?'转CRM':'LEAD'}</button></div></div>})}</div></div>

   <div className="lsa-panel"><header><div><Target/><b>{zh?'销售漏斗':'SALES FUNNEL'}</b></div><span>{sessionId?'SUPABASE LIVE':'TikTok LIVE'}</span></header><div className="lsa-funnel">{[[zh?'当前在线':'En direct',state.viewers],[zh?'互动/分钟':'Interactions/min',Math.round(state.commentsPerMinute)],[zh?'留资':'Leads',state.leads],[zh?'A类':'Leads A',state.hotLeads],[zh?'预约':'RDV',state.appointments]].map(([n,v],i)=><div key={String(n)}><span>{n}</span><strong>{v}</strong><i style={{width:`${Math.max(34,100-i*14)}%`}}/></div>)}</div><button className="lsa-crm" onClick={onOpenCrm}>{zh?'打开CRM跟进高意向客户':'OUVRIR LES HOT LEADS DANS LE CRM'}</button></div>
  </section>

  <section className="lsa-architecture"><h2>{zh?'V0.2.1学习闭环':'Boucle d’apprentissage V0.2.1'}</h2><div>{['LIVE Session','Metric Snapshots','AI Diagnosis','Director Action','Pre/Post Measure','Intent Radar','Green Fast CRM','Outcome Learning'].map((x,i)=><span key={x}>{i+1}<b>{x}</b></span>)}</div></section>
 </main>
}
function Metric({icon,value,label}:{icon:React.ReactNode;value:string|number;label:string}){return <div className="lsa-metric"><span>{icon}</span><strong>{value}</strong><small>{label}</small></div>}
