-- LIVE SALES AI V0.2
-- Applied to GF Auto Supabase project on 2026-09-05.
-- Additive schema + RLS for authenticated owner/manager/presenter access.

alter table if exists live_sessions enable row level security;
alter table if exists live_metric_snapshots enable row level security;
alter table if exists live_comments enable row level security;
alter table if exists live_director_actions enable row level security;
alter table if exists live_leads enable row level security;

drop policy if exists live_sessions_access on live_sessions;
create policy live_sessions_access on live_sessions for all to authenticated
using (presenter_id = auth.uid() or "current_role"() = any(array['owner'::app_role,'manager'::app_role]))
with check (presenter_id = auth.uid() or "current_role"() = any(array['owner'::app_role,'manager'::app_role]));

drop policy if exists live_metric_access on live_metric_snapshots;
create policy live_metric_access on live_metric_snapshots for all to authenticated
using (exists(select 1 from live_sessions s where s.id=session_id and (s.presenter_id=auth.uid() or "current_role"() = any(array['owner'::app_role,'manager'::app_role]))))
with check (exists(select 1 from live_sessions s where s.id=session_id and (s.presenter_id=auth.uid() or "current_role"() = any(array['owner'::app_role,'manager'::app_role]))));

drop policy if exists live_comments_access on live_comments;
create policy live_comments_access on live_comments for all to authenticated
using (exists(select 1 from live_sessions s where s.id=session_id and (s.presenter_id=auth.uid() or "current_role"() = any(array['owner'::app_role,'manager'::app_role]))))
with check (exists(select 1 from live_sessions s where s.id=session_id and (s.presenter_id=auth.uid() or "current_role"() = any(array['owner'::app_role,'manager'::app_role]))));

drop policy if exists live_director_access on live_director_actions;
create policy live_director_access on live_director_actions for all to authenticated
using (exists(select 1 from live_sessions s where s.id=session_id and (s.presenter_id=auth.uid() or "current_role"() = any(array['owner'::app_role,'manager'::app_role]))))
with check (exists(select 1 from live_sessions s where s.id=session_id and (s.presenter_id=auth.uid() or "current_role"() = any(array['owner'::app_role,'manager'::app_role]))));

drop policy if exists live_leads_access on live_leads;
create policy live_leads_access on live_leads for all to authenticated
using (assigned_to=auth.uid() or "current_role"() = any(array['owner'::app_role,'manager'::app_role]))
with check (assigned_to=auth.uid() or "current_role"() = any(array['owner'::app_role,'manager'::app_role]));
