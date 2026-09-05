-- LIVE SALES AI V0.1
-- Schema only. This migration is committed on the feature branch and is not applied to production automatically.

create table if not exists live_sessions (
  id uuid primary key default gen_random_uuid(),
  platform text not null default 'tiktok',
  account_name text,
  presenter_id uuid,
  started_at timestamptz,
  ended_at timestamptz,
  status text not null default 'planned' check (status in ('planned','live','ended','cancelled')),
  title text,
  primary_vehicle text,
  campaign text,
  total_views integer default 0,
  peak_concurrent integer default 0,
  avg_watch_seconds numeric default 0,
  comments integer default 0,
  shares integer default 0,
  follows integer default 0,
  leads integer default 0,
  appointments integer default 0,
  visits integer default 0,
  test_drives integer default 0,
  sales integer default 0,
  revenue numeric default 0,
  created_at timestamptz not null default now()
);

create table if not exists live_metric_snapshots (
  id bigserial primary key,
  session_id uuid not null references live_sessions(id) on delete cascade,
  captured_at timestamptz not null default now(),
  viewers integer default 0,
  peak integer default 0,
  avg_watch_seconds numeric default 0,
  comments_per_minute numeric default 0,
  likes integer default 0,
  shares integer default 0,
  follows integer default 0,
  leads integer default 0,
  hot_leads integer default 0,
  appointments integer default 0,
  traffic_score integer,
  retention_score integer,
  interaction_score integer,
  intent_score integer,
  capture_score integer,
  live_score integer
);

create table if not exists live_comments (
  id bigserial primary key,
  session_id uuid not null references live_sessions(id) on delete cascade,
  platform_comment_id text,
  platform_user_id text,
  platform_user_name text,
  comment_text text not null,
  intent_score integer default 0,
  intent_band text check (intent_band in ('A','B','C')),
  intent_tags text[] default '{}',
  detected_at timestamptz not null default now(),
  routed_to_crm boolean default false,
  customer_id uuid
);

create table if not exists live_director_actions (
  id bigserial primary key,
  session_id uuid not null references live_sessions(id) on delete cascade,
  created_at timestamptz not null default now(),
  priority text not null,
  severity text not null,
  action_type text not null,
  reason text,
  script_fr text,
  script_zh text,
  measure_for_seconds integer default 90,
  acknowledged_at timestamptz,
  executed_at timestamptz,
  pre_metric jsonb,
  post_metric jsonb,
  result_delta jsonb
);

create table if not exists live_leads (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references live_sessions(id) on delete set null,
  customer_id uuid,
  platform text not null default 'tiktok',
  platform_user_name text,
  phone text,
  whatsapp text,
  interested_model text,
  budget numeric,
  purchase_timing text,
  intent_score integer default 0,
  intent_band text check (intent_band in ('A','B','C')),
  intent_tags text[] default '{}',
  assigned_to uuid,
  next_action text,
  next_action_at timestamptz,
  status text not null default 'new' check (status in ('new','contacted','qualified','appointment','visited','test_drive','won','lost')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_live_metric_session_time on live_metric_snapshots(session_id,captured_at desc);
create index if not exists idx_live_comments_session_intent on live_comments(session_id,intent_score desc);
create index if not exists idx_live_leads_band on live_leads(intent_band,status);
create index if not exists idx_live_director_session_time on live_director_actions(session_id,created_at desc);
