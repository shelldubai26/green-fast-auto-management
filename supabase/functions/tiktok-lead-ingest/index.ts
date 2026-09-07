import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}})
type Event={username?:string;display_name?:string;tiktok_user_id?:string;source_type?:'live'|'video_comment';source_account?:string;source_url?:string;source_content_id?:string;text?:string;timestamp?:string;metadata?:Record<string,unknown>}

const modelPatterns=[['Jetour T2',/\b(t2|jetour)\b/i],['Prado',/\bprado\b/i],['Land Cruiser',/\b(land\s?cruiser|lc300|lc200)\b/i],['BMW X5',/\b(x5|bmw)\b/i],['SUV',/\bsuv\b/i]] as const
function classify(text:string){
  const t=text.toLowerCase();let score=0;const signals:string[]=[]
  const add=(re:RegExp,n:number,label:string)=>{if(re.test(t)){score+=n;signals.push(label)}}
  add(/\b(prix|price|combien|co[uû]te|tarif)\b/i,30,'price')
  add(/\b(acheter|achat|buy|purchase|je veux|je cherche|int[eé]ress[eé])\b/i,30,'purchase')
  add(/\b(disponible|available|stock|en stock)\b/i,20,'availability')
  add(/\b(cr[eé]dit|financement|finance|acompte|mensualit[eé])\b/i,25,'finance')
  add(/\b(venir|visiter|voir la voiture|essai|test drive|showroom|adresse|o[uù] êtes-vous)\b/i,30,'visit')
  add(/\b(whatsapp|contact|num[eé]ro|telephone|t[eé]l[eé]phone)\b/i,20,'contact')
  const interested_model=modelPatterns.find(([,re])=>re.test(text))?.[0]||null
  if(interested_model)score+=10
  score=Math.min(100,score)
  return {score,interested_model,intent_label:signals.join(', ')||'general_interest'}
}

Deno.serve(async(req)=>{
  try{
    if(req.method!=='POST')return json({error:'method_not_allowed'},405)
    const supabaseUrl=Deno.env.get('SUPABASE_URL')!,anonKey=Deno.env.get('SUPABASE_ANON_KEY')!,serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const auth=req.headers.get('authorization')||''
    const userClient=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:auth}},auth:{persistSession:false}})
    const {data:{user},error:userError}=await userClient.auth.getUser()
    if(userError||!user)return json({error:'unauthorized'},401)
    const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false}})
    const {data:profile}=await admin.from('profiles').select('role').eq('id',user.id).maybeSingle()
    if(!profile||!['owner','manager'].includes(profile.role))return json({error:'forbidden'},403)

    const body=await req.json();const events:Event[]=Array.isArray(body?.events)?body.events:[body]
    if(events.length>500)return json({error:'too_many_events',max:500},400)
    let accepted=0,filtered=0,updated=0,inserted=0
    for(const e of events){
      const username=String(e.username||'').replace(/^@/,'').trim(),text=String(e.text||'').trim()
      if(!username||!text||!['live','video_comment'].includes(String(e.source_type||''))){filtered++;continue}
      const c=classify(text)
      if(c.score<30){filtered++;continue}
      accepted++
      const sourceContentId=String(e.source_content_id||'')
      const existingQ=admin.from('social_leads').select('id,occurrence_count,intent_score').eq('username',username).eq('source_type',e.source_type!).eq('original_text',text)
      const {data:existing}=sourceContentId?await existingQ.eq('source_content_id',sourceContentId).maybeSingle():await existingQ.is('source_content_id',null).maybeSingle()
      const seen=e.timestamp&&Number.isFinite(Date.parse(e.timestamp))?new Date(e.timestamp).toISOString():new Date().toISOString()
      if(existing){
        await admin.from('social_leads').update({last_seen_at:seen,occurrence_count:(existing.occurrence_count||1)+1,intent_score:Math.max(existing.intent_score||0,c.score),interested_model:c.interested_model,intent_label:c.intent_label,status:c.score>=80?'high_intent':undefined}).eq('id',existing.id)
        updated++
      }else{
        const {error}=await admin.from('social_leads').insert({platform:'tiktok',tiktok_user_id:e.tiktok_user_id||null,username,display_name:e.display_name||null,source_type:e.source_type,source_account:e.source_account||null,source_url:e.source_url||null,source_content_id:sourceContentId||null,original_text:text,interested_model:c.interested_model,intent_label:c.intent_label,intent_score:c.score,status:c.score>=80?'high_intent':'new',first_seen_at:seen,last_seen_at:seen,metadata:e.metadata||{}})
        if(!error)inserted++
      }
    }
    return json({ok:true,received:events.length,accepted,filtered,inserted,updated})
  }catch(e){return json({error:'unexpected_error',detail:e instanceof Error?e.message:String(e)},500)}
})
