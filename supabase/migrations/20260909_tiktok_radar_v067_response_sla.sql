-- V0.6.7 urgent prospect response SLA
alter table public.social_leads add column if not exists sla_due_at timestamptz;
alter table public.social_leads add column if not exists reclaim_at timestamptz;
alter table public.social_leads add column if not exists response_started_at timestamptz;
alter table public.social_leads add column if not exists sla_state text check (sla_state in ('pending','overdue','responded','reassigned','manager_pool'));
alter table public.social_leads add column if not exists reassignment_count integer not null default 0;
alter table public.social_leads add column if not exists previous_assignee uuid references public.profiles(id);
create index if not exists social_leads_sla_idx on public.social_leads(sla_state,reclaim_at) where status not in ('converted','invalid');
-- Production migration also installs gfauto_set_lead_sla, gfauto_mark_social_lead_contacted and radar_worker_manage_lead_sla.
