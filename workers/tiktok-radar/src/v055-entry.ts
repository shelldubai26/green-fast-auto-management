import './index.js'
import { startCandidateDiscovery } from './candidate-discovery.js'
import { startLeadEnrichment } from './lead-enrichment.js'
import { startLiveWatch } from './live-watch.js'
import { startLeadRetention } from './lead-retention.js'

startCandidateDiscovery()
startLeadEnrichment()
startLiveWatch()
startLeadRetention()
console.log('GF Auto TikTok Radar V0.6.6: LIVE Watch + prospect assignment + CRM workbench + retention')
