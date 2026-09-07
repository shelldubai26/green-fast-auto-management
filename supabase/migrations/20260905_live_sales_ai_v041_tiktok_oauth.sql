create table if not exists public.tiktok_oauth_states (
  state_hash text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.tiktok_account_tokens (
  connection_id uuid primary key references public.tiktok_account_connections(id) on delete cascade,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  refresh_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.tiktok_oauth_states enable row level security;
alter table public.tiktok_account_tokens enable row level security;
-- no authenticated client policies: only service-role Edge Functions access OAuth states/tokens.
create index if not exists idx_tiktok_oauth_states_user_expires on public.tiktok_oauth_states(user_id,expires_at desc);
