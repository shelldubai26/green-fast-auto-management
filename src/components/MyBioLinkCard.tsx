import {useEffect,useState} from 'react'
import {Copy,ExternalLink,Link2} from 'lucide-react'
import {supabase} from '../lib/supabase'
import type {Lang} from '../lib/modules'

type Bio={code:string;clicks:number;leads:number;active:boolean}
export default function MyBioLinkCard({lang,userId}:{lang:Lang;userId:string}){
 const[row,setRow]=useState<Bio|null>(null),[copied,setCopied]=useState(false)
 useEffect(()=>{if(!supabase)return;void supabase.from('employee_bio_links').select('code,clicks,leads,active').eq('profile_id',userId).maybeSingle().then(({data})=>setRow(data as Bio|null))},[userId])
 if(!row)return null
 const url=`${window.location.origin}/go/${encodeURIComponent(row.code)}`
 const copy=async()=>{await navigator.clipboard.writeText(url);setCopied(true);setTimeout(()=>setCopied(false),1600)}
 return <section className="card" style={{marginBottom:16}}><div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'flex-start',flexWrap:'wrap'}}><div><small style={{fontWeight:800,letterSpacing:'.08em'}}>TIKTOK BIO LINK</small><h3 style={{margin:'5px 0'}}>{lang==='zh'?'我的永久获客链接':'Mon lien permanent TikTok'}</h3><p style={{margin:0,opacity:.72}}>{lang==='zh'?'放在 TikTok 个人主页一次即可。客户通过这里进入，会自动归到你的 CRM。':'À placer une seule fois dans votre bio TikTok. Les prospects seront attribués automatiquement à votre CRM.'}</p></div><span className="role-badge">{row.active?(lang==='zh'?'已启用':'Actif'):(lang==='zh'?'已停用':'Inactif')}</span></div><div style={{display:'flex',gap:10,alignItems:'center',marginTop:14,flexWrap:'wrap'}}><div style={{flex:'1 1 260px',padding:'11px 13px',border:'1px solid #dfe5e1',borderRadius:10,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}><Link2 size={15} style={{verticalAlign:'middle',marginRight:8}}/>{url}</div><button className="secondary" onClick={()=>void copy()}><Copy size={15}/>{copied?(lang==='zh'?'已复制':'Copié'):(lang==='zh'?'复制链接':'Copier')}</button><a className="secondary" href={url} target="_blank" rel="noreferrer"><ExternalLink size={15}/>{lang==='zh'?'预览':'Aperçu'}</a></div><div style={{display:'flex',gap:20,marginTop:12,fontSize:13}}><span>{lang==='zh'?'点击':'Clics'} <b>{row.clicks||0}</b></span><span>{lang==='zh'?'CRM客户':'Prospects CRM'} <b>{row.leads||0}</b></span><span>Code <b>{row.code}</b></span></div></section>
}
