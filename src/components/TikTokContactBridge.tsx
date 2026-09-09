import {useEffect} from 'react'
import {supabase} from '../lib/supabase'
import type {Lang} from '../lib/modules'

function cleanUsername(raw:string){return raw.replace(/^@+/,'').trim()}
function isMissingUsername(v:string){const x=v.toLowerCase();return !x||x==='unknown'||x==='null'||x==='undefined'}

export default function TikTokContactBridge({lang}:{lang:Lang}){
 useEffect(()=>{
  const label=lang==='fr'?'Compte TikTok indisponible':'TikTok账号未获取'
  const scan=()=>{
   document.querySelectorAll<HTMLElement>('.lr-drawer').forEach(drawer=>{
    const username=cleanUsername(drawer.querySelector('h2')?.textContent||'')
    if(!isMissingUsername(username))return
    const btn=[...drawer.querySelectorAll<HTMLButtonElement>('button.primary-action')].find(b=>/立即联系|Je contacte/i.test(b.textContent||''))
    if(btn){btn.disabled=true;btn.title=label;btn.textContent=label}
   })
  }
  scan()
  const observer=new MutationObserver(scan)
  observer.observe(document.body,{childList:true,subtree:true})

  const onClick=(event:MouseEvent)=>{
   const target=event.target as HTMLElement|null
   const btn=target?.closest<HTMLButtonElement>('.lr-drawer button.primary-action')
   if(!btn||!/立即联系|Je contacte/i.test(btn.textContent||''))return
   const drawer=btn.closest<HTMLElement>('.lr-drawer')
   if(!drawer)return
   const username=cleanUsername(drawer.querySelector('h2')?.textContent||'')
   event.preventDefault();event.stopPropagation();event.stopImmediatePropagation()
   if(isMissingUsername(username)){window.alert(label);return}
   const url='https://www.tiktok.com/@'+encodeURIComponent(username)
   const opened=window.open(url,'_blank','noopener,noreferrer')
   if(!opened)window.location.assign(url)
   const comment=(drawer.querySelector('.intent-card p')?.textContent||'').replace(/^“|”$/g,'').trim()
   void (async()=>{
    if(!supabase)return
    let q=supabase.from('social_leads').select('id').eq('username',username).order('assigned_at',{ascending:false}).limit(1)
    if(comment)q=q.eq('original_text',comment)
    let {data,error}=await q.maybeSingle()
    if((error||!data)&&comment){const retry=await supabase.from('social_leads').select('id').eq('username',username).order('assigned_at',{ascending:false}).limit(1).maybeSingle();data=retry.data;error=retry.error}
    if(data?.id)await supabase.rpc('gfauto_mark_social_lead_contacted',{p_lead_id:data.id})
   })()
  }
  document.addEventListener('click',onClick,true)
  return()=>{observer.disconnect();document.removeEventListener('click',onClick,true)}
 },[lang])
 return null
}
