import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 try{
  const auth=req.headers.get("Authorization")||"",url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!,openai=Deno.env.get("OPENAI_API_KEY");
  if(!openai)throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");
  const client=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
  const{data:{user}}=await client.auth.getUser();if(!user)throw new Error("Unauthorized");
  const{data:p}=await client.from("profiles").select("role").eq("id",user.id).single();if(!p||!["owner","manager","sales"].includes(p.role))throw new Error("Forbidden");
  const body=await req.json(),note=String(body.note||"").trim();if(!note)return new Response(JSON.stringify({translation:""}),{headers:{...cors,"Content-Type":"application/json"}});
  const requestBody={model:"gpt-5-mini",input:[{role:"user",content:[{type:"input_text",text:`Translate this automotive customer follow-up note or social-media comment into natural concise Simplified Chinese for a Chinese manager. If it is already Chinese, return it as-is. Preserve names, usernames, vehicle models, amounts, dates, phone numbers and meaning. Do not add facts. Return only the Chinese translation.
French note:
${note}`}]}],text:{format:{type:"json_schema",name:"customer_note_translation",strict:true,schema:{type:"object",properties:{translation:{type:"string"}},required:["translation"],additionalProperties:false}}}};
  const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${openai}`,"Content-Type":"application/json"},body:JSON.stringify(requestBody)});
  const j=await r.json();if(!r.ok)throw new Error(j?.error?.message||"Translation failed");
  const outputText=j.output_text||j.output?.flatMap((x:any)=>x.content||[]).find((x:any)=>x.type==="output_text")?.text;
  const result=JSON.parse(outputText||'{"translation":""}');
  return new Response(JSON.stringify(result),{headers:{...cors,"Content-Type":"application/json"}});
 }catch(e){return new Response(JSON.stringify({error:e instanceof Error?e.message:String(e)}),{status:400,headers:{...cors,"Content-Type":"application/json"}})}
});