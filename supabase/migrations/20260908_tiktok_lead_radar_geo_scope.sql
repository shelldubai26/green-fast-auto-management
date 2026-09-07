alter table public.tiktok_watchlist
  add column if not exists country_code text not null default 'CI',
  add column if not exists city text not null default 'Abidjan',
  add column if not exists market_scope text not null default 'abidjan_auto',
  add column if not exists priority int not null default 50 check (priority between 0 and 100),
  add column if not exists account_type text default 'dealer';

alter table public.social_leads
  add column if not exists market_country_code text not null default 'CI',
  add column if not exists market_city text not null default 'Abidjan',
  add column if not exists geo_confidence int not null default 50 check (geo_confidence between 0 and 100);

create index if not exists tiktok_watchlist_market_idx on public.tiktok_watchlist(country_code, city, is_active, priority desc);
create index if not exists social_leads_market_idx on public.social_leads(market_country_code, market_city, intent_score desc, last_seen_at desc);

comment on column public.tiktok_watchlist.market_scope is 'Primary monitoring scope. Default abidjan_auto for Green Fast Côte d’Ivoire.';
comment on column public.social_leads.geo_confidence is 'Confidence that the lead belongs to the Côte d’Ivoire / Abidjan auto market.';
