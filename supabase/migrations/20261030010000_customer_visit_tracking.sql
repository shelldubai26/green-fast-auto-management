alter table public.customers
  add column if not exists visit_count integer not null default 0,
  add column if not exists visited_2_at timestamptz,
  add column if not exists visited_3_at timestamptz,
  add column if not exists dead_at timestamptz;

update public.customers
set visit_count = greatest(coalesce(visit_count,0),
  case when signed_at is not null then 2 when visited_at is not null then 1 else 0 end),
  visited_2_at = case when signed_at is not null then coalesce(visited_2_at,signed_at) else visited_2_at end
where coalesce(visit_count,0)=0 or (signed_at is not null and visited_2_at is null);
