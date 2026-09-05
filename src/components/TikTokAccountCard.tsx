import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Link2, Loader2, RefreshCw, Unplug } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { getMyTikTokConnection, getTikTokOAuthReadiness, type TikTokConnection } from '../lib/tiktokAccounts'
import type { Lang } from '../lib/modules'
import '../live-sales-ai.css'

type Props={userId?:string;lang:Lang}

export default function TikTokAccountCard({userId,lang}:Props){
  const zh=lang==='zh'
  const readiness=getTikTokOAuthReadiness()
  const [connection,setConnection]=useState<TikTokConnection|null>(null)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [isOwner,setIsOwner]=useState(false)

  const load=async()=>{
    try{
      setLoading(true);setError('')
      if(!supabase)throw new Error('Supabase not configured')
      const {data:{user}}=await supabase.auth.getUser()
      const currentUserId=user?.id||''
      let profileId=userId||currentUserId
      if(!profileId)throw new Error(zh?'未找到当前登录用户':'Utilisateur connecté introuvable')
      if(currentUserId){
        const {data:profile}=await supabase.from('profiles').select('role').eq('id',currentUserId).maybeSingle()
        setIsOwner(profile?.role==='owner')
      }
      setConnection(await getMyTikTokConnection(profileId))
    }catch(e:any){setError(e?.message||String(e))}finally{setLoading(false)}
  }

  useEffect(()=>{void load()},[userId])

  const startOAuth=async()=>{
    try{
      setLoading(true);setError('')
      if(!readiness.ready)throw new Error(zh?'TikTok OAuth 公共配置尚未完成':'Configuration publique TikTok OAuth incomplète')
      if(!supabase)throw new Error('Supabase not configured')
      const {data:{session}}=await supabase.auth.getSession()
      if(!session?.access_token)throw new Error(zh?'请先登录 Green Fast Auto':'Connectez-vous d’abord à Green Fast Auto')
      const base=import.meta.env.VITE_SUPABASE_URL
      const res=await fetch(`${base}/functions/v1/tiktok-oauth-start`,{headers:{authorization:`Bearer ${session.access_token}`}})
      const body=await res.json()
      if(!res.ok||!body.url)throw new Error(body.error||'TikTok OAuth unavailable')
      window.location.assign(body.url)
    }catch(e:any){setError(e?.message||String(e));setLoading(false)}
  }

  const disconnect=async()=>{
    try{
      if(!isOwner)throw new Error(zh?'只有 Owner 可以断开 TikTok 连接':'Seul le Owner peut déconnecter TikTok')
      if(!connection) return
      const ok=window.confirm(zh?'确认断开该 TikTok 账号？断开后将停止同步该账号数据。':'Confirmer la déconnexion de ce compte TikTok ? La synchronisation sera arrêtée.')
      if(!ok)return
      setLoading(true);setError('')
      if(!supabase)throw new Error('Supabase not configured')
      const {data:{session}}=await supabase.auth.getSession()
      if(!session?.access_token)throw new Error(zh?'请先登录 Green Fast Auto':'Connectez-vous d’abord à Green Fast Auto')
      const base=import.meta.env.VITE_SUPABASE_URL
      const res=await fetch(`${base}/functions/v1/tiktok-disconnect`,{
        method:'POST',
        headers:{authorization:`Bearer ${session.access_token}`,'content-type':'application/json'},
        body:JSON.stringify({profile_id:connection.profile_id,open_id:connection.open_id})
      })
      const body=await res.json().catch(()=>({}))
      if(!res.ok)throw new Error(body.error||'TikTok disconnect failed')
      await load()
    }catch(e:any){setError(e?.message||String(e));setLoading(false)}
  }

  const connected=connection?.token_status==='connected'
  return <section className="lsa-tiktok-account">
    <div>
      <span className="lsa-eyebrow"><Link2 size={14}/> TIKTOK ACCOUNT</span>
      <h3>{connected?(connection?.display_name||connection?.username||'TikTok'):(zh?'连接个人 TikTok 账号':'Connecter mon compte TikTok')}</h3>
      <p>{connected?(zh?'该员工的 LIVE Session 与内容数据将绑定到此 TikTok 身份。重新授权可申请新增的视频/统计权限。':'Les sessions LIVE et les données de contenu de cet employé seront liées à cette identité TikTok. La réautorisation permet de demander de nouvelles permissions vidéo/statistiques.'):(zh?'使用 TikTok 官方 Login Kit 授权当前员工账号。这里仅连接身份，不代表已经获得 LIVE 实时评论/在线人数数据权限。':'Autorisez le compte employé via TikTok Login Kit. Cette connexion établit l’identité uniquement et ne donne pas automatiquement accès aux données LIVE temps réel.')}</p>
      {!connected&&!readiness.ready&&<small className="lsa-status"><AlertTriangle size={12}/> {zh?'等待 Client Key + Redirect URI':'En attente du Client Key + Redirect URI'}</small>}
      {error&&<small className="lsa-status">{error}</small>}
    </div>
    {connected?<div className="lsa-tiktok-actions">
      <div className="lsa-connected"><CheckCircle2 size={18}/><b>{zh?'已连接':'CONNECTÉ'}</b></div>
      <button className="lsa-live" onClick={()=>void startOAuth()} disabled={loading||!readiness.ready}>{loading?<Loader2 size={16}/>:<RefreshCw size={16}/>} {zh?'重新授权':'RÉAUTORISER'}</button>
      {isOwner&&<button className="lsa-secondary" onClick={()=>void disconnect()} disabled={loading}><Unplug size={16}/> {zh?'断开连接':'DÉCONNECTER'}</button>}
    </div>:<button className="lsa-live" onClick={()=>void startOAuth()} disabled={loading||!readiness.ready}>{loading?<Loader2 size={16}/>:<Link2 size={16}/>} {readiness.ready?(zh?'连接 TikTok':'CONNECTER TIKTOK'):(zh?'OAuth 未配置':'OAUTH NON CONFIGURÉ')}</button>}
  </section>
}
