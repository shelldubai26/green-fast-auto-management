import { useEffect, useState } from 'react'
import { CheckCircle2, Link2, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { getMyTikTokConnection, type TikTokConnection } from '../lib/tiktokAccounts'
import type { Lang } from '../lib/modules'

type Props={userId:string;lang:Lang}

export default function TikTokAccountCard({userId,lang}:Props){
  const zh=lang==='zh'
  const [connection,setConnection]=useState<TikTokConnection|null>(null)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  useEffect(()=>{getMyTikTokConnection(userId).then(setConnection).catch(e=>setError(String(e?.message||e))).finally(()=>setLoading(false))},[userId])

  const connect=async()=>{
    try{
      setLoading(true);setError('')
      if(!supabase)throw new Error('Supabase not configured')
      const {data:{session}}=await supabase.auth.getSession()
      if(!session?.access_token)throw new Error('No authenticated session')
      const base=import.meta.env.VITE_SUPABASE_URL
      const res=await fetch(`${base}/functions/v1/tiktok-oauth-start`,{headers:{authorization:`Bearer ${session.access_token}`}})
      const body=await res.json()
      if(!res.ok||!body.url)throw new Error(body.error||'TikTok OAuth unavailable')
      window.location.assign(body.url)
    }catch(e:any){setError(e?.message||String(e));setLoading(false)}
  }

  const connected=connection?.token_status==='connected'
  return <section className="lsa-tiktok-account">
    <div><span className="lsa-eyebrow"><Link2 size={14}/> TIKTOK ACCOUNT</span><h3>{connected?(connection?.display_name||connection?.username||'TikTok'):(zh?'连接个人TikTok账号':'Connecter mon compte TikTok')}</h3><p>{connected?(zh?'此销售的LIVE Session将绑定到该TikTok身份。':'Les sessions LIVE de ce vendeur seront liées à cette identité TikTok.'):(zh?'每个销售独立授权，数据不会和其他销售混在一起。':'Chaque vendeur autorise son propre compte. Les données restent séparées.')}</p>{error&&<small className="lsa-status">{error}</small>}</div>
    {connected?<div className="lsa-connected"><CheckCircle2 size={18}/><b>{zh?'已连接':'CONNECTÉ'}</b></div>:<button className="lsa-live" onClick={()=>void connect()} disabled={loading}>{loading?<Loader2 size={16}/>:<Link2 size={16}/>} {zh?'连接TikTok':'CONNECTER TIKTOK'}</button>}
  </section>
}
