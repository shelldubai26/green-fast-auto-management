import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','access-control-allow-origin':'*'}})
const hex=async(input:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input)))).map(b=>b.toString(16).padStart(2,'0')).join('')

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:{'access-control-allow-origin':'*','access-control-allow-headers':'authorization, content-type'}})
  const clientKey=Deno.env.get('TIKTOK_CLIENT_KEY')
  const redirectUri=Deno.env.get('TIKTOK_REDIRECT_URI')
  const url=Deno.env.get('SUPABASE_URL')!
  const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  if(!clientKey||!redirectUri)return json({error:'TikTok OAuth is not configured yet'},503)
  const auth=req.headers.get('authorization')||''
  const jwt=auth.replace(/^Bearer\s+/i,'')
  const admin=createClient(url,serviceKey,{auth:{persistSession:false}})
  const {data:{user},error}=await admin.auth.getUser(jwt)
  if(error||!user)return json({error:'Unauthorized'},401)
  const state=crypto.randomUUID()+crypto.randomUUID()
  const stateHash=await hex(state)
  const expires=new Date(Date.now()+10*60*1000).toISOString()
  const {error:insertError}=await admin.from('tiktok_oauth_states').insert({state_hash:stateHash,user_id:user.id,expires_at:expires})
  if(insertError)return json({error:insertError.message},500)
  const u=new URL('https://www.tiktok.com/v2/auth/authorize/')
  u.searchParams.set('client_key',clientKey)
  u.searchParams.set('scope','user.info.basic')
  u.searchParams.set('response_type','code')
  u.searchParams.set('redirect_uri',redirectUri)
  u.searchParams.set('state',state)
  return json({url:u.toString()})
})
