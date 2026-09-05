import { useEffect,useState } from 'react'
import { AlertTriangle,CheckCircle2,RefreshCw,ShieldCheck,XCircle } from 'lucide-react'
import type { Lang } from '../lib/modules'
import { getProductionReadiness,type ProductionReadiness } from '../lib/liveProductionReadiness'
import TikTokAccountCard from './TikTokAccountCard'
import '../live-production-readiness.css'

export default function LiveProductionReadiness({lang}:{lang:Lang}){
 const zh=lang==='zh', [data,setData]=useState<ProductionReadiness|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('')
 const load=async()=>{setLoading(true);setError('');try{setData(await getProductionReadiness())}catch(e:any){setError(e?.message||String(e))}finally{setLoading(false)}}
 useEffect(()=>{void load()},[])
 const statusLabel=(l:string)=>l==='ready'?(zh?'就绪':'PRÊT'):l==='warning'?(zh?'待验证':'À VÉRIFIER'):(zh?'阻塞':'BLOQUÉ')
 const Icon=({level}:{level:string})=>level==='ready'?<CheckCircle2/>:level==='warning'?<AlertTriangle/>:<XCircle/>
 return <main className="lpr-page">
  <section className="lpr-hero"><div><span><ShieldCheck size={15}/> LIVE SALES AI • V0.6</span><h1>{zh?'生产上线准备中心':'Centre de préparation production'}</h1><p>{zh?'把“能演示”与“能正式上线”分开检查：数据源、TikTok授权、车辆成本、真实成交样本和QA。':'Sépare clairement la démo de la production : source LIVE, OAuth TikTok, coûts véhicule, résultats réels et QA.'}</p></div><button onClick={()=>void load()}><RefreshCw size={16}/>{zh?'重新检查':'Revérifier'}</button></section>
  {error&&<div className="lpr-error">{error}</div>}
  {data&&<>
   <section className="lpr-score"><div className="lpr-ring"><strong>{data.score}</strong><small>/100</small></div><div><small>{zh?'当前上线准备度':'READINESS PRODUCTION'}</small><h2>{data.score>=85?(zh?'接近上线':'Presque prêt'):data.score>=60?(zh?'仍需验证':'Validation requise'):(zh?'暂不建议生产上线':'Pas prêt pour production')}</h2><p>{zh?'当前 Provider：':'Provider actuel : '}{data.provider}</p></div></section>
   <section className="lpr-metrics">{[[zh?'车辆':'Véhicules',data.metrics.vehicles],[zh?'价格完整':'Prix prêts',data.metrics.priceReady],[zh?'落地成本':'Coûts complets',data.metrics.landedCostReady],[zh?'毛利完整':'Marges prêtes',data.metrics.grossProfitReady],[zh?'真实成交':'Ventes réelles',data.metrics.sales],[zh?'TikTok已连接':'TikTok connectés',data.metrics.tiktokConnected],[zh?'销售账号':'Vendeurs',data.metrics.sellers],[zh?'LIVE历史':'Sessions LIVE',data.metrics.liveSessions]].map(([n,v])=><div key={String(n)}><small>{n}</small><strong>{v}</strong></div>)}</section>
   <TikTokAccountCard lang={lang}/>
   <section className="lpr-checks">{data.checks.map(c=><article key={c.id} className={c.level}><div className="lpr-icon"><Icon level={c.level}/></div><div><header><b>{c.title}</b><span>{statusLabel(c.level)}</span></header><p>{c.detail}</p></div><strong>{c.value||''}</strong></article>)}</section>
   <section className="lpr-gate"><h3>{zh?'正式上线 Gate':'Gate de mise en production'}</h3><p>{zh?'只有当 TikTok OAuth 完成真实账号端到端测试、官方/授权LIVE实时数据源验证、车辆落地成本覆盖足够、并有真实LIVE与成交样本后，才应把 Simulation Provider 切换成 Authorized Provider。':'Ne basculer de Simulation Provider vers Authorized Provider qu’après test OAuth réel, validation d’une source LIVE officielle/autorisée, couverture coûts suffisante et échantillons LIVE/vente réels.'}</p></section>
  </>}
  {loading&&!data&&<div className="lpr-loading">{zh?'正在检查生产条件…':'Vérification des conditions de production…'}</div>}
 </main>
}
