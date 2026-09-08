import './index.js'
import { startCandidateDiscovery } from './candidate-discovery.js'
import { startLeadEnrichment } from './lead-enrichment.js'
import { startLiveWatch } from './live-watch.js'

startCandidateDiscovery()
startLeadEnrichment()
startLiveWatch()
console.log('GF Auto TikTok Radar V0.6.5: LIVE Watch + realtime LIVE priority + active video pool + discovery + public contact enrichment')
