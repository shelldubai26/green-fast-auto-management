create table if not exists public.tiktok_watchlist (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  display_name text,
  category text default 'auto',
  is_active boolean not null default true,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.social_leads (
  id uuid primary key default gen_random_uuid(),
  platform text not null default 'tiktok' check (platform in ('tiktok')),
  tiktok_user_id text,
  username text not null,
  display_name text,
  avatar_url text,
  source_type text not null check (source_type in ('live','video_comment')),
  source_account text,
  source_url text,
  source_content_id text,
  original_text text not null,
  detected_language text,
  interested_model text,
  intent_label text,
  intent_score int not null default 0 check (intent_score between 0 and 100),
  occurrence_count int not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new','high_intent','assigned','contact_attempted','replied','contact_captured','converted','invalid')),
  assigned_to uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz,
  contact_attempted_at timestamptz,
  replied_at timestamptz,
  contact_captured_at timestamptz,
  converted_at timestamptz,
  converted_customer_id uuid references public.customers(id) on delete set null,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists social_leads_status_idx on public.social_leads(status);
create index if not exists social_leads_intent_score_idx on public.social_leads(intent_score desc);
create index if not exists social_leads_assigned_to_idx on public.social_leads(assigned_to);
create index if not exists social_leads_username_idx on public.social_leads(username);
create index if not exists social_leads_last_seen_idx on public.social_leads(last_seen_at desc);

create unique index if not exists social_leads_dedupe_idx
on public.social_leads(platform, username, source_type, coalesce(source_content_id,''), md5(original_text));

alter table public.tiktok_watchlist enable row level security;
alter table public.social_leads enable row level security;

grant select, insert, update, delete on table public.tiktok_watchlist to authenticated;
grant select, insert, update on table public.social_leads to authenticated;

drop policy if exists tiktok_watchlist_read on public.tiktok_watchlist;
create policy tiktok_watchlist_read on public.tiktok_watchlist
for select to authenticated using (true);

drop policy if exists tiktok_watchlist_manage on public.tiktok_watchlist;
create policy tiktok_watchlist_manage on public.tiktok_watchlist
for all to authenticated
using (public.current_role() = any(array['owner'::app_role,'manager'::app_role]))
with check (public.current_role() = any(array['owner'::app_role,'manager'::app_role]));

drop policy if exists social_leads_read on public.social_leads;
create policy social_leads_read on public.social_leads
for select to authenticated
using (
  public.current_role() = any(array['owner'::app_role,'manager'::app_role])
  or assigned_to = auth.uid()
  or assigned_to is null
);

drop policy if exists social_leads_insert on public.social_leads;
create policy social_leads_insert on public.social_leads
for insert to authenticated with check (true);

drop policy if exists social_leads_update on public.social_leads;
create policy social_leads_update on public.social_leads
for update to authenticated
using (
  public.current_role() = any(array['owner'::app_role,'manager'::app_role])
  or assigned_to = auth.uid()
  or assigned_to is null
)
with check (
  public.current_role() = any(array['owner'::app_role,'manager'::app_role])
  or assigned_to = auth.uid()
  or assigned_to is null
);

create or replace function public.gfauto_prepare_social_lead()
returns trigger language plpgsql set search_path='public' as $$
begin
  new.updated_at := now();
  if new.status = 'assigned' and new.assigned_to is not null and new.assigned_at is null then new.assigned_at := now(); end if;
  if new.status = 'contact_attempted' and new.contact_attempted_at is null then new.contact_attempted_at := now(); end if;
  if new.status = 'replied' and new.replied_at is null then new.replied_at := now(); end if;
  if new.status = 'contact_captured' and new.contact_captured_at is null then new.contact_captured_at := now(); end if;
  if new.status = 'converted' and new.converted_at is null then new.converted_at := now(); end if;
  return new;
end $$;

drop trigger if exists trg_prepare_social_lead on public.social_leads;
create trigger trg_prepare_social_lead before insert or update on public.social_leads
for each row execute function public.gfauto_prepare_social_lead();

comment on table public.social_leads is 'Pre-CRM public social accounts detected from TikTok. Convert to customers only after direct contact details are captured.';
comment on table public.tiktok_watchlist is 'TikTok automotive accounts monitored by the external live/comment ingestion service.';
