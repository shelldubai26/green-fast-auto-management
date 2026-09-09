import CrmModule from './CrmModule'
import CrmTikTokSourceSummary from './CrmTikTokSourceSummary'
import CrmProspectWorkbench from './CrmProspectWorkbench'
import ProspectFunnelBoard from './ProspectFunnelBoard'
import TikTokContactBridge from './TikTokContactBridge'
import type { Lang,Role } from '../lib/modules'

export default function CrmModuleV2({lang,role,userId}:{lang:Lang;role:Role;userId:string}){
 return <><TikTokContactBridge lang={lang}/>{role!=='owner'&&<CrmProspectWorkbench lang={lang} role={role} userId={userId}/>} {role==='manager'&&<ProspectFunnelBoard lang={lang}/>}<CrmTikTokSourceSummary lang={lang}/><CrmModule lang={lang} role={role} userId={userId}/></>
}