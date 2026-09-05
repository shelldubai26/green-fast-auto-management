export type LiveMetrics={
  viewers:number
  peak:number
  avgWatchSeconds:number
  commentsPerMinute:number
  leads:number
  hotLeads:number
  appointments:number
}

export type LiveScores={traffic:number;retention:number;interaction:number;intent:number;capture:number;total:number}

export const clamp=(n:number,min=0,max=100)=>Math.max(min,Math.min(max,n))

export function calculateLiveScores(m:LiveMetrics):LiveScores{
  // V0.1 internal management baselines. These are not TikTok official ranking thresholds.
  const traffic=clamp(Math.round((m.viewers/180)*100))
  const retention=clamp(Math.round((m.avgWatchSeconds/75)*100))
  const interaction=clamp(Math.round((m.commentsPerMinute/12)*100))
  const intent=clamp(Math.round((m.hotLeads/Math.max(1,m.leads))*100))
  const capture=clamp(Math.round((m.leads/Math.max(1,m.viewers))*800))
  const total=Math.round(traffic*.20+retention*.25+interaction*.20+intent*.20+capture*.15)
  return {traffic,retention,interaction,intent,capture,total}
}

export type IntentTag='PRICE'|'STOCK'|'FINANCING'|'TEST_DRIVE'|'LOCATION'|'WARRANTY'|'PARTS'|'DELIVERY'|'COMPARISON'|'GENERAL'
export type IntentResult={score:number;band:'A'|'B'|'C';tags:IntentTag[];reasons:string[]}

const patterns:{tag:IntentTag;weight:number;terms:string[]}[]=[
  {tag:'TEST_DRIVE',weight:35,terms:['essai','test drive','tester','试驾']},
  {tag:'FINANCING',weight:30,terms:['crédit','credit','financement','mensualité','贷款','分期']},
  {tag:'STOCK',weight:24,terms:['disponible','stock','arrive','arrivage','现货','库存','到货']},
  {tag:'PRICE',weight:22,terms:['prix','combien','final','coûte','price','价格','多少钱']},
  {tag:'LOCATION',weight:12,terms:['où','adresse','abidjan','cocody','location','地址','在哪里']},
  {tag:'WARRANTY',weight:18,terms:['garantie','warranty','质保','保修']},
  {tag:'PARTS',weight:16,terms:['pièces','pieces','spare','配件','零件']},
  {tag:'DELIVERY',weight:14,terms:['livraison','delivery','交车','配送']},
  {tag:'COMPARISON',weight:12,terms:['vs','compare','différence','difference','对比','区别']},
]

const strongPurchaseTerms=['je veux','je prends','acheter','réserver','reserve','book','buy','我要','预订','购买']
const timingTerms=['aujourd’hui','aujourd hui','demain','cette semaine','ce mois','today','tomorrow','本周','今天','明天','这个月']

export function scoreIntent(text:string,repeatHighIntentCount=0):IntentResult{
  const s=text.toLowerCase()
  let score=5
  const tags:IntentTag[]=[]
  const reasons:string[]=[]
  for(const p of patterns){
    if(p.terms.some(t=>s.includes(t.toLowerCase()))){score+=p.weight;tags.push(p.tag);reasons.push(p.tag)}
  }
  if(strongPurchaseTerms.some(t=>s.includes(t))){score+=25;reasons.push('EXPLICIT_PURCHASE')}
  if(timingTerms.some(t=>s.includes(t))){score+=18;reasons.push('PURCHASE_TIMING')}
  if(/cs55|cs75|gs3|t2|shan(hai)?|jetour|changan|gac|m817|song pro/i.test(text)){score+=10;reasons.push('MODEL_SPECIFIC')}
  if(repeatHighIntentCount>0){score+=Math.min(15,repeatHighIntentCount*5);reasons.push('REPEATED_INTENT')}
  score=clamp(score)
  if(!tags.length)tags.push('GENERAL')
  return {score,band:score>=85?'A':score>=65?'B':'C',tags:[...new Set(tags)],reasons}
}

export type DirectorAdvice={priority:keyof Omit<LiveScores,'total'>;severity:'low'|'medium'|'high';action:string;scriptFr:string;scriptZh:string;measureForSeconds:number}

export function getDirectorAdvice(scores:LiveScores):DirectorAdvice{
  const entries=(Object.entries(scores).filter(([k])=>k!=='total') as [keyof Omit<LiveScores,'total'>,number][]).sort((a,b)=>a[1]-b[1])
  const [weak,value]=entries[0]
  const severity:value extends number ? never : never = undefined as never
  const level:'low'|'medium'|'high'=value<45?'high':value<65?'medium':'low'
  if(weak==='retention')return {priority:weak,severity:level,action:'VISIBLE_DEMO',scriptFr:'Si vous avez une famille, regardez la taille réelle du coffre…',scriptZh:'如果你是家庭用车，看一下真实后备箱空间……',measureForSeconds:90}
  if(weak==='interaction')return {priority:weak,severity:level,action:'BINARY_QUESTION',scriptFr:'CS55 à 19M ou CS75 à 22M ? Écrivez 55 ou 75.',scriptZh:'CS55 1900万还是CS75 2200万？评论55或75。',measureForSeconds:60}
  if(weak==='capture')return {priority:weak,severity:level,action:'WHATSAPP_CTA',scriptFr:'Prix final + disponibilité : envoyez LIVE + le modèle au 07 00 73 71 18.',scriptZh:'要最终价格和库存，请WhatsApp发送LIVE+车型到07 00 73 71 18。',measureForSeconds:90}
  if(weak==='intent')return {priority:weak,severity:level,action:'QUALIFY_AUDIENCE',scriptFr:'Vous achetez ce mois-ci ou vous comparez encore ? Écrivez ACHAT ou COMPARER.',scriptZh:'你这个月准备买，还是先比较？评论“购买”或“比较”。',measureForSeconds:90}
  return {priority:weak,severity:level,action:'TRAFFIC_HOOK',scriptFr:'19 millions à Abidjan : voici ce que vous avez réellement.',scriptZh:'1900万在阿比让到底可以买到什么？',measureForSeconds:60}
}
