alter table public.social_leads
  add column if not exists original_text_zh text;

create index if not exists social_leads_original_text_zh_idx
  on public.social_leads (id)
  where original_text_zh is null;
