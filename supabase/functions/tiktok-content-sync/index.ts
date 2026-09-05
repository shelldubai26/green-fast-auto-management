import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}})
const asIso=(v:any)=>v?new Date(Number(v)*1000).toISOString():null

Deno.serve(async(req)=>{
  try{
    const supabaseUrl=Deno.env.get('SUPABASE_URL')!
    const anonKey=Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const clientKey=Deno.env.get('TIKTOK_CLIENT_KEY')!
    const clientSecret=Deno.env.get('TIKTOK_CLIENT_SECRET')!
    if(!supabaseUrl||!anonKey||!serviceKey||!clientKey||!clientSecret)return json({error:'server_config_error'},500)

    const auth=req.headers.get('authorization')||''
    const userClient=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:auth}},auth:{persistSession:false}})
    const {data:{user},error:userError}=await userClient.auth.getUser()
    if(userError||!user)return json({error:'unauthorized'},401)
    const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false}})

    const {data:conn,error:connError}=await admin.from('tiktok_account_connections').select('*').eq('user_id',user.id).eq('status','connected').maybeSingle()
    if(connError||!conn)return json({error:'tiktok_not_connected'},400)
    const {data:tok,error:tokError}=await admin.from('tiktok_account_tokens').select('*').eq('connection_id',conn.id).maybeSingle()
    if(tokError||!tok)return json({error:'token_missing'},400)

    let accessToken=tok.access_token as string
    let refreshToken=tok.refresh_token as string|null
    let expiresAt=tok.expires_at as string|null
    const expiresSoon=!expiresAt||new Date(expiresAt).getTime()<Date.now()+5*60*1000
    if(expiresSoon){
      if(!refreshToken)return json({error:'reauthorization_required'},401)
      const form=new URLSearchParams({client_key:clientKey,client_secret:clientSecret,grant_type:'refresh_token',refresh_token:refreshToken})
      const rr=await fetch('https://open.tiktokapis.com/v2/oauth/token/',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form})
      const rj=await rr.json()
      if(!rr.ok||!rj.access_token)return json({error:'token_refresh_failed',detail:rj?.error||null},401)
      accessToken=rj.access_token
      refreshToken=rj.refresh_token||refreshToken
      expiresAt=rj.expires_in?new Date(Date.now()+Number(rj.expires_in)*1000).toISOString():null
      const refreshExpiresAt=rj.refresh_expires_in?new Date(Date.now()+Number(rj.refresh_expires_in)*1000).toISOString():tok.refresh_expires_at
      const scopes=String(rj.scope||'').split(',').filter(Boolean)
      await admin.from('tiktok_account_tokens').update({access_token:accessToken,refresh_token:refreshToken,expires_at:expiresAt,refresh_expires_at:refreshExpiresAt,updated_at:new Date().toISOString()}).eq('connection_id',conn.id)
      await admin.from('tiktok_account_connections').update({granted_scopes:scopes.length?scopes:conn.granted_scopes,token_expires_at:expiresAt,refresh_expires_at:refreshExpiresAt,updated_at:new Date().toISOString()}).eq('id',conn.id)
      await admin.from('tiktok_accounts').update({scopes:scopes.length?scopes:conn.granted_scopes,last_refresh_at:new Date().toISOString(),token_status:'connected'}).eq('profile_id',user.id).eq('open_id',conn.open_id)
    }

    const accountRes=await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url,follower_count,following_count,likes_count,video_count',{headers:{authorization:`Bearer ${accessToken}`}})
    const accountJson=await accountRes.json()
    if(!accountRes.ok||accountJson?.error?.code && accountJson.error.code!=='ok')return json({error:'tiktok_user_info_failed',detail:accountJson?.error||null},502)
    const info=accountJson?.data?.user||{}

    const {data:canonical}=await admin.from('tiktok_accounts').select('id').eq('profile_id',user.id).eq('open_id',conn.open_id).maybeSingle()
    await admin.from('tiktok_account_stats').insert({profile_id:user.id,tiktok_account_id:canonical?.id||null,follower_count:info.follower_count??null,following_count:info.following_count??null,likes_count:info.likes_count??null,video_count:info.video_count??null,captured_at:new Date().toISOString()})
    await admin.from('tiktok_account_connections').update({display_name:info.display_name||conn.display_name,avatar_url:info.avatar_url||conn.avatar_url,last_synced_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',conn.id)
    await admin.from('tiktok_accounts').update({display_name:info.display_name||conn.display_name,avatar_url:info.avatar_url||conn.avatar_url,last_refresh_at:new Date().toISOString()}).eq('profile_id',user.id).eq('open_id',conn.open_id)

    let cursor:number|undefined=undefined,hasMore=true,pages=0,synced=0
    while(hasMore&&pages<10){
      const body:any={max_count:20}; if(cursor!==undefined)body.cursor=cursor
      const vr=await fetch('https://open.tiktokapis.com/v2/video/list/?fields=id,title,video_description,duration,cover_image_url,embed_link,create_time,like_count,comment_count,share_count,view_count',{method:'POST',headers:{authorization:`Bearer ${accessToken}`,'content-type':'application/json'},body:JSON.stringify(body)})
      const vj=await vr.json()
      if(!vr.ok||vj?.error?.code && vj.error.code!=='ok')return json({error:'tiktok_video_list_failed',detail:vj?.error||null,synced},502)
      const videos=vj?.data?.videos||[]
      if(videos.length){
        const rows=videos.map((v:any)=>({profile_id:user.id,tiktok_account_id:canonical?.id||null,video_id:String(v.id),title:v.title||null,video_description:v.video_description||null,duration_seconds:v.duration??null,cover_image_url:v.cover_image_url||null,embed_link:v.embed_link||null,create_time:asIso(v.create_time),view_count:v.view_count??null,like_count:v.like_count??null,comment_count:v.comment_count??null,share_count:v.share_count??null,synced_at:new Date().toISOString(),updated_at:new Date().toISOString()}))
        const {error:upsertError}=await admin.from('tiktok_videos').upsert(rows,{onConflict:'profile_id,video_id'})
        if(upsertError)return json({error:'video_upsert_failed',detail:upsertError.message},500)
        synced+=rows.length
      }
      hasMore=Boolean(vj?.data?.has_more)
      cursor=vj?.data?.cursor
      pages++
      if(cursor===undefined||cursor===null)hasMore=false
    }

    return json({ok:true,account:{display_name:info.display_name||conn.display_name,follower_count:info.follower_count??null,following_count:info.following_count??null,likes_count:info.likes_count??null,video_count:info.video_count??null},videos_synced:synced,pages})
  }catch(e){return json({error:'unexpected_error',detail:e instanceof Error?e.message:String(e)},500)}
})