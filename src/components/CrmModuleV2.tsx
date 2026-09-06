import CrmModule from './CrmModule'
import CrmTikTokSourceSummary from './CrmTikTokSourceSummary'
import type { Lang,Role } from '../lib/modules'

export default function CrmModuleV2({lang,role,userId}:{lang:Lang;role:Role;userId:string}){
 return <><CrmTikTokSourceSummary lang={lang}/><CrmModule lang={lang} role={role} userId={userId}/></>
}
