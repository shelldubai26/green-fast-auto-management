import './index.js'
import { startCandidateDiscovery } from './candidate-discovery.js'
import { startLeadEnrichment } from './lead-enrichment.js'
import { startLiveWatch } from './live-watch.js'
import { startLeadRetention } from './lead-retention.js'
import { startLeadSla } from './lead-sla.js'

startCandidateDiscovery()
startLeadEnrichment()
startLiveWatch()
startLeadRetention()
startLeadSla()
console.log('GF Auto TikTok Radar V0.6.7: LIVE Watch + prospect assignment + response SLA + CRM workbench + retention')
