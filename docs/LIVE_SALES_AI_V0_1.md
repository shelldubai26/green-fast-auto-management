# LIVE SALES AI — V0.1 Architecture

## Product goal
Turn a LIVE sales session into a measurable revenue funnel without fake engagement or automated manipulation.

**Traffic → Retention → Interaction → Intent → Lead → Appointment → Visit → Test drive → Sale**

Green Fast Auto is the first production test environment. The architecture remains vertical-agnostic so the same engine can later support real estate, ecommerce, beauty and education.

## V0.1 modules

### 1. Live Control Room
Single-screen dashboard for current viewers, peak concurrent viewers, average watch time, comment velocity, leads, A-leads and appointments.

### 2. Event Normalizer
Converts all incoming data into one internal event model. V0.1 supports manual/demo events and later official platform connectors.

Event types:
- viewer_snapshot
- watch_time_snapshot
- comment
- like_snapshot
- share_snapshot
- follow_snapshot
- lead_created
- appointment_created
- sale_created
- director_action

### 3. Live Score Engine
Five normalized sub-scores, each 0–100:
- Traffic 20%
- Retention 25%
- Interaction 20%
- Intent 20%
- Lead Capture 15%

V0.1 formula is a management baseline, not a TikTok official ranking formula. Each account will later learn its own baselines.

### 4. AI Director
Every 30–90 seconds the Director asks: **what is the weakest bottleneck right now?**

Examples:
- Retention low → stop specifications; demonstrate a visible feature.
- Interaction low → ask one binary choice question.
- Intent high but capture low → issue a WhatsApp / keyword CTA.
- Leads high but appointments low → switch from information CTA to appointment CTA.

Director output schema:
```json
{
  "priority": "retention",
  "severity": "high",
  "action": "open_trunk_demo",
  "reason": "average_watch_time_down",
  "script_fr": "Si vous avez une famille, regardez la taille réelle du coffre…",
  "script_zh": "如果你是家庭用车，看一下真实后备箱空间……",
  "measure_for_seconds": 90
}
```

### 5. Intent Radar
Classifies real comments and lead events into commercial intents:
- PRICE
- STOCK
- FINANCING
- TEST_DRIVE
- LOCATION
- WARRANTY
- PARTS
- DELIVERY
- COMPARISON
- GENERAL

Intent Score 0–100 combines:
- purchase verb / explicit request
- price or stock question
- financing question
- test-drive request
- purchase timing
- repeated high-intent comments
- model specificity

Suggested bands:
- 85–100: A / HOT
- 65–84: B / WARM
- 0–64: C / NURTURE

### 6. Lead Router
Every qualified lead should capture:
- platform
- live_session_id
- platform_user_name
- phone / WhatsApp when voluntarily provided
- interested model
- budget
- purchase timing
- intent_score
- intent_tags
- owner / salesperson
- next_action

A-leads should be followed up as quickly as operationally possible after the LIVE. Internal Green Fast training target: under 15 minutes after session end.

### 7. CRM Bridge
V0.1 maps LIVE leads into the existing Green Fast `customers` CRM. Later a generic adapter layer will support third-party CRMs.

### 8. Post-LIVE Review
For every session store:
- hook variants
- products shown
- Director interventions
- metric before intervention
- metric after intervention
- leads generated
- appointments
- visits
- sales

This creates the learning dataset for V0.2.

## Architecture

```text
TikTok LIVE / Manual feed / Official connectors
                    │
                    ▼
             Event Normalizer
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
   Metrics Aggregator     Comment Stream
          │                   │
          ▼                   ▼
   Live Score Engine      Intent Radar
          │                   │
          └─────────┬─────────┘
                    ▼
               AI Director
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
   Presenter Cockpit      Lead Router
                              │
                              ▼
                       Green Fast CRM
                              │
                              ▼
                        Post-LIVE Review
```

## Data safety / platform compliance
V0.1 does not create fake viewers, likes, comments, follows or watch time. It does not automate account farms or manipulate ranking signals. Platform connectors must use officially permitted access or user-authorized data sources.

## V0.1 success metrics
Primary business metric:
`appointments / qualified LIVE leads`

Secondary metrics:
- leads / 1,000 viewers
- A-leads / total leads
- appointment rate
- visit rate
- test-drive rate
- sale rate
- revenue per LIVE hour
- improvement after Director interventions

## V0.2 trigger
Move to V0.2 only after Green Fast has enough real sessions to compare at least:
- multiple presenters
- multiple time slots
- multiple vehicle models
- repeated hook / CTA variants

V0.2 will introduce learned baselines, experiment attribution and personalized Director policies.