# LIVE SALES AI V0.4 — Multi-seller + delayed conversion + TikTok account binding

## Why V0.4
Automotive LIVE does not convert instantly. A viewer may become a CRM lead today and buy days or weeks later. The source LIVE session must stay attached to the customer through the whole sales cycle.

## Conversion model
- First LIVE source is locked on `live_leads.session_id` / `source_locked_at`.
- Default reporting attribution window: 120 days.
- Sales after the window are not discarded; they are labeled `late_conversion`.
- Reports expose 30 / 60 / 90 / 120-day conversion views and average days-to-sale.
- AI action attribution remains an assist signal, not proof of causality.

## 30 concurrent sellers
Each Green Fast user has a unique `profiles.id` and may bind one TikTok account in `tiktok_account_connections`.
Each `live_sessions` row has `presenter_id` and optional `tiktok_account_id`.
RLS rules isolate data:
- salesperson: own LIVE sessions, metrics, comments and assigned LIVE leads;
- owner / manager: all sellers and cross-seller dashboards.
This architecture supports 30+ simultaneous seller sessions without mixing data.

## TikTok account connection
Official Login Kit OAuth 2.0 is used for identity authorization.
Flow:
1. Seller clicks Connect TikTok in Green Fast.
2. Authenticated Edge Function creates a one-time CSRF state.
3. User authorizes `user.info.basic` on TikTok.
4. TikTok redirects to callback Edge Function.
5. Callback exchanges code for access + refresh token, fetches profile via `/v2/user/info/`, stores account metadata and server-only tokens.
6. Future LIVE provider adapters attach incoming events to the correct `tiktok_account_id`.

Required Supabase secrets:
- `TIKTOK_CLIENT_KEY`
- `TIKTOK_CLIENT_SECRET`
- `TIKTOK_REDIRECT_URI`
- `APP_REDIRECT_URL`

## Important API boundary
Login Kit can bind identity and authorized user data. Public TikTok for Developers documentation does not currently expose a general-purpose public API for arbitrary LIVE room real-time comments/viewer metrics for this use case. Real-time LIVE ingestion must therefore be implemented only through an approved/official TikTok product, partner access, or another authorized provider if available. No unofficial scraping or fake engagement.

## Next
- Add Connect TikTok UI card and account status.
- Token refresh Edge Function.
- Provider adapter interface for real-time LIVE events.
- Owner 30-seller command center.
- Seller personal dashboard filtered by presenter/account.
