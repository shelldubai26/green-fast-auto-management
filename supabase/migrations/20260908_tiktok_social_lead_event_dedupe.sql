alter table public.social_leads add column if not exists source_event_id text;

create unique index if not exists social_leads_source_event_uidx
on public.social_leads(platform, source_event_id)
where source_event_id is not null;
