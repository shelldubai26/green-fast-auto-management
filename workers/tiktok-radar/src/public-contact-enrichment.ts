type Json=Record<string,any>
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms))

export type PublicContact={phone:string|null;whatsapp:string|null;email:string|null;source:string|null;confidence:number;checkedAt:string}

export class SocQPublicContactEnricher{
  private base='https://api.socq.ai/v1'
  constructor(private apiKey:string,private pollMs=1500,private timeoutMs=30_000){}
  private headers(){return{Authorization:`Bearer ${this.apiKey}`,'Content-Type':'application/json'}}
  private async json(url:string,init?:RequestInit):Promise<Json>{const r=await fetch(url,{...init,headers:{...this.headers(),...(init?.headers||{})}});let b:Json={};try{b=await r.json() as Json}catch{}if(!r.ok)throw new Error(`socq_${r.status}:${String(b?.error?.message||b?.message||b?.error||`http_${r.status}`)}`);return b}
  private taskId(b:Json){return String(b?.data?.task_id||b?.data?.id||b?.task_id||b?.id||'')}
  private items(b:Json):any[]{for(const v of [b?.data?.results?.items,b?.data?.items,b?.results?.items,b?.items])if(Array.isArray(v))return v;return[]}
  private async submit(payload:Json){let b:Json;try{b=await this.json(`${this.base}/tiktok/profiles`,{method:'POST',body:JSON.stringify(payload)})}catch(e){const m=e instanceof Error?e.message:String(e);if(!/socq_400|socq_422/i.test(m))throw e;b=await this.json(`${this.base}/tiktok/profiles`,{method:'POST',body:JSON.stringify({username:payload.usernames?.[0]})})}const id=this.taskId(b);if(!id)throw new Error('socq_profile_task_id_missing');return id}
  private async wait(id:string){const start=Date.now();for(;;){const b=await this.json(`${this.base}/tasks/${encodeURIComponent(id)}?limit=10`);const s=String(b?.data?.status||b?.status||'').toLowerCase();if(['succeeded','success','completed','done'].includes(s))return b;if(['failed','error','cancelled','canceled'].includes(s))throw new Error(`socq_profile_task_${s}`);if(Date.now()-start>this.timeoutMs)throw new Error('socq_profile_task_timeout');await sleep(this.pollMs)}}
  private normalizePhone(raw:string){const cleaned=raw.replace(/[()\-.\s]/g,'');return /^\+?\d{8,15}$/.test(cleaned)?cleaned:null}
  async lookup(username:string):Promise<PublicContact>{const checkedAt=new Date().toISOString();const clean=username.replace(/^@/,'');const id=await this.submit({usernames:[`@${clean}`],results_limit:1});const body=await this.wait(id);const item=this.items(body)[0]||{};const bio=String(item?.bio||item?.signature||item?.description||item?.profile?.bio||'');const emailDirect=String(item?.email||item?.business_email||item?.contact_email||'').trim();const emailMatch=(emailDirect||bio.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]||'').trim()||null;const phones=[...(bio.match(/\+?\d[\d\s().-]{7,}\d/g)||[])].map(x=>this.normalizePhone(x)).filter(Boolean) as string[];const waMatch=bio.match(/(?:whatsapp|wa|wapp)\s*[:：-]?\s*(\+?\d[\d\s().-]{7,}\d)/i);const whatsapp=waMatch?this.normalizePhone(waMatch[1]):null;const phone=phones.find(x=>x!==whatsapp)||phones[0]||null;const hasAny=Boolean(phone||whatsapp||emailMatch);return{phone,whatsapp,email:emailMatch,source:hasAny?'tiktok_public_profile':null,confidence:hasAny?90:0,checkedAt}}
}
