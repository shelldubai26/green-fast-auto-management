import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const hex=async(input:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input)))).map(b=>b.toString(16).padStart(2,'0')).join('')
const redirect=(base:string,params:Record<string,string>)=>{const u=new URL(base);Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,v));return Response.redirect(u.toString(),302)}

Deno.serve(async(req)=>{
  const clientKey=Deno.env.get('TIKTOK_CLIENT_KEY')
  const clientSecret=Deno.env.get('TIKTOK_CLIENT_SECRET')
  const redirectUri=Deno.env.get('TIKTOK_REDIRECT_URI')
  const appRedirect=Deno.env.get('APP_REDIRECT_URL')||'https://gfauto-management-v1.vercel.app/'
  const supabaseUrl=Deno.env.get('SUPABASE_URL')!
  const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  if(!clientKey||!clientSecret||!redirectUri)return redirect(appRedirect,{tiktok:'config_error'})
  const u=new URL(req.url)
  const code=u.searchParams.get('code')
  const state=u.searchParams.get('state')
  const authError=u.searchParams.get('error')
  if(authError||!code||!state)return redirect(appRedirect,{tiktok:'denied'})

  const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false}})
  const stateHash=await hex(state)
  const {data:stateRow}=await admin.from('tiktok_oauth_states').select('user_id,expires_at,used_at').eq('state_hash',stateHash).maybeSingle()
  if(!stateRow||stateRow.used_at||new Date(stateRow.expires_at).getTime()<Date.now())return redirect(appRedirect,{tiktok:'invalid_state'})

  const form=new URLSearchParams({client_key:clientKey,client_secret:clientSecret,code,grant_type:'authorization_code',redirect_uri:redirectUri})
  const tokenRes=await fetch('https://open.tiktokapis.com/v2/oauth/token/',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form})
  if(!tokenRes.ok)return redirect(appRedirect,{tiktok:'token_error'})
  const token=await tokenRes.json()
  if(!token.access_token||!token.open_id)return redirect(appRedirect,{tiktok:'token_error'})

  const profileRes=await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url',{headers:{authorization:`Bearer ${token.access_token}`}})
  const profileJson=profileRes.ok?await profileRes.json():null
  const profile=profileJson?.data?.user||{}
  const now=Date.now()
  const expiresAt=token.expires_in?new Date(now+Number(token.expires_in)*1000).toISOString():null
  const refreshExpiresAt=token.refresh_expires_in?new Date(now+Number(token.refresh_expires_in)*1000).toISOString():null
  const scopes=String(token.scope||'').split(',').filter(Boolean)

  const {data:connection,error:connectionError}=await admin.from('tiktok_account_connections').upsert({user_id:stateRow.user_id,open_id:token.open_id,display_name:profile.display_name||null,avatar_url:profile.avatar_url||null,status:'connected',granted_scopes:scopes,token_expires_at:expiresAt,refresh_expires_at:refreshExpiresAt,last_synced_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:'user_id'}).select('id').single()
  if(connectionError||!connection)return redirect(appRedirect,{tiktok:'db_error'})

  const {error:tokenError}=await admin.from('tiktok_account_tokens').upsert({connection_id:connection.id,access_token:token.access_token,refresh_token:token.refresh_token||null,expires_at:expiresAt,refresh_expires_at:refreshExpiresAt,updated_at:new Date().toISOString()},{onConflict:'connection_id'})
  if(tokenError)return redirect(appRedirect,{tiktok:'db_error'})

  const {error:canonicalError}=await admin.from('tiktok_accounts').upsert({profile_id:stateRow.user_id,open_id:token.open_id,display_name:profile.display_name||null,avatar_url:profile.avatar_url||null,scopes,token_ref:connection.id,token_status:'connected',connected_at:new Date().toISOString(),last_refresh_at:new Date().toISOString(),revoked_at:null},{onConflict:'profile_id,open_id'})
  if(canonicalError)return redirect(appRedirect,{tiktok:'db_error'})

  await admin.from('tiktok_oauth_states').update({used_at:new Date().toISOString()}).eq('state_hash',stateHash)
  return redirect(appRedirect,{tiktok:'connected'})
})
