import type { Lang, Role } from '../lib/modules'
import LiveRevenueAdvisor from './LiveRevenueAdvisor'
import LiveSalesAI from './LiveSalesAI'

export default function LiveSalesAIWithRevenue({lang,role,userId,onOpenCrm}:{lang:Lang;role:Role;userId:string;onOpenCrm?:()=>void}){
 return <>
  <LiveRevenueAdvisor lang={lang} userId={userId}/>
  <LiveSalesAI lang={lang} role={role} userId={userId} onOpenCrm={onOpenCrm}/>
 </>
}
