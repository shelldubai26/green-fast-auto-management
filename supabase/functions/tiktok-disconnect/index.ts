import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors={
  'access-control-allow-origin':'*',
  'access-control-allow-headers':'authorization, content-type',
  'content-type':'application/json'
}
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors})

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors})
  if(req.method!=='POST')return json({error:'Method not allowed'},405)

  const supabaseUrl=Deno.env.get('SUPABASE_URL')!
  const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const clientKey=Deno.env.get('TIKTOK_CLIENT_KEY')
  const clientSecret=Deno.env.get('TIKTOK_CLIENT_SECRET')
  const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false}})

  const auth=req.headers.get('authorization')||''
  const jwt=auth.replace(/^Bearer\s+/i,'')
  const {data:{user},error:userError}=await admin.auth.getUser(jwt)
  if(userError||!user)return json({error:'Unauthorized'},401)

  const {data:profile}=await admin.from('profiles').select('role').eq('id',user.id).maybeSingle()
  if(profile?.role!=='owner')return json({error:'Owner permission required'},403)

  let payload:any={}
  try{payload=await req.json()}catch{return json({error:'Invalid JSON'},400)}
  const profileId=String(payload?.profile_id||'')
  const openId=String(payload?.open_id||'')
  if(!profileId||!openId)return json({error:'profile_id and open_id are required'},400)

  const {data:account,error:accountError}=await admin.from('tiktok_accounts')
    .select('id,profile_id,open_id,token_ref,token_status')
    .eq('profile_id',profileId).eq('open_id',openId).maybeSingle()
  if(accountError)return json({error:'Account lookup failed'},500)
  if(!account)return json({ok:true,already_disconnected:true})

  let revokeStatus:'revoked'|'local_only'='local_only'
  if(account.token_ref){
    const {data:tokenRow}=await admin.from('tiktok_account_tokens')
      .select('access_token').eq('connection_id',account.token_ref).maybeSingle()
    if(tokenRow?.access_token&&clientKey&&clientSecret){
      const form=new URLSearchParams({client_key:clientKey,client_secret:clientSecret,token:tokenRow.access_token})
      const revokeRes=await fetch('https://open.tiktokapis.com/v2/oauth/revoke/',{
        method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form
      })
      if(revokeRes.ok)revokeStatus='revoked'
    }
  }

  const now=new Date().toISOString()
  await admin.from('tiktok_accounts').update({token_status:'revoked',revoked_at:now,last_refresh_at:now}).eq('id',account.id)
  await admin.from('tiktok_account_connections').update({status:'revoked',updated_at:now}).eq('user_id',profileId).eq('open_id',openId)
  if(account.token_ref)await admin.from('tiktok_account_tokens').delete().eq('connection_id',account.token_ref)

  return json({ok:true,revoke_status:revokeStatus})
})
