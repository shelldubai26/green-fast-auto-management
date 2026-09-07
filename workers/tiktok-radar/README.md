# Green Fast TikTok Radar Worker

Long-running worker for the Abidjan / Côte d’Ivoire TikTok automotive Lead Radar.

## Responsibilities

- Read active `tiktok_watchlist` accounts scoped to Côte d’Ivoire.
- Tier A/B/C scheduling (10 / 30 / 120 minutes).
- Maintain multiple public TikTok LIVE connections concurrently.
- Buffer LIVE chat events and pre-filter obvious automotive purchase intent.
- Poll an optional video-comment provider through the normalized HTTP adapter.
- De-duplicate events with `social_leads.source_event_id`.
- Write only pre-CRM social leads into `social_leads`.
- Update `tiktok_watcher_state` so managers can see health, errors and recent lead counts.

## Environment

```bash
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<server-only-secret>

# Optional but recommended for higher TikTok LIVE signing limits
EULER_SIGN_API_KEY=<server-only-key>

# Optional video-comment provider implementing the normalized HTTP contract
RADAR_VIDEO_PROVIDER_BASE_URL=https://provider.example.com
RADAR_VIDEO_PROVIDER_TOKEN=<server-only-token>

# Worker loop; tier scheduling is still enforced per account
RADAR_LOOP_MS=60000
```

Never expose the service role, Euler key, provider key or TikTok session cookies in the browser or Vercel client environment.

## Run

```bash
npm install
npm run check
npm start
```

## Container

```bash
docker build -t gfauto-tiktok-radar .
docker run --env-file .env gfauto-tiktok-radar
```

Use a long-running worker/container host rather than a serverless request function because LIVE WebSocket connections must remain open.

## Video provider contract

The optional HTTP provider must expose:

- `GET /videos?username=<handle>&limit=<n>` -> `{ "videos": [{ "id": "...", "url": "...", "createdAt": "..." }] }`
- `GET /video/comments?username=<handle>&video_id=<id>&since=<iso>` -> `{ "comments": [...] }`

Each normalized comment must contain `externalId`, `username`, `text`, `createdAt`, `sourceType`, and `sourceAccount`; optional fields include `displayName`, `userId`, `sourceContentId`, `sourceUrl`, and `metadata`.

## Compliance boundary

Only ingest publicly visible automotive content needed for the defined sales-listening purpose. Do not bypass private/restricted surfaces, CAPTCHA/access controls, or enrich users with private/sensitive data. Keep human review before outreach and apply retention/deletion rules to public social lead data.
