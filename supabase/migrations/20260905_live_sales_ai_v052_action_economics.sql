-- LIVE SALES AI V0.5.2 — action economics + presenter/model/CTA learning matrix
-- Economic values are decision-support estimates. They are not accounting revenue or causal proof.

alter table public.live_director_actions
  add column if not exists recommended_model text,
  add column if not exists economic_objective text,
  add column if not exists value_basis text,
  add column if not exists close_probability numeric,
  add column if not exists unit_value_xof numeric,
  add column if not exists expected_value_before_xof numeric,
  add column if not exists expected_value_after_xof numeric,
  add column if not exists expected_value_lift_xof numeric,
  add column if not exists cta_type text;

alter table public.live_director_actions
  drop constraint if exists live_director_actions_value_basis_check;
alter table public.live_director_actions
  add constraint live_director_actions_value_basis_check
  check (value_basis is null or value_basis in ('gross_profit','revenue_proxy'));

create index if not exists idx_live_director_model_action
  on public.live_director_actions(recommended_model,action_type,executed_at desc);

create or replace view public.live_revenue_action_learning
with (security_invoker=true) as
select
  ls.presenter_id,
  coalesce(nullif(upper(trim(lda.recommended_model)),''),'UNKNOWN') as model_key,
  coalesce(lda.action_type,'UNKNOWN') as action_type,
  coalesce(lda.cta_type,'UNKNOWN') as cta_type,
  coalesce(lda.value_basis,'revenue_proxy') as value_basis,
  count(*)::int as actions,
  count(*) filter (where lda.post_metric is not null)::int as measured_actions,
  round(avg(lda.expected_value_before_xof) filter (where lda.expected_value_before_xof is not null))::numeric as avg_expected_value_before_xof,
  round(avg(lda.expected_value_after_xof) filter (where lda.expected_value_after_xof is not null))::numeric as avg_expected_value_after_xof,
  round(avg(lda.expected_value_lift_xof) filter (where lda.expected_value_lift_xof is not null))::numeric as avg_expected_value_lift_xof,
  coalesce(sum(laa.assisted_leads),0)::int as assisted_leads,
  coalesce(sum(laa.appointments),0)::int as appointments,
  coalesce(sum(laa.visits),0)::int as visits,
  coalesce(sum(laa.test_drives),0)::int as test_drives,
  coalesce(sum(laa.deposits),0)::int as deposits,
  coalesce(sum(laa.sales),0)::int as sales,
  coalesce(sum(laa.attributed_revenue_xof),0)::numeric as attributed_revenue_xof
from public.live_director_actions lda
join public.live_sessions ls on ls.id=lda.session_id
left join public.live_action_attribution laa on laa.director_action_id=lda.id
where lda.executed_at is not null
group by ls.presenter_id,model_key,action_type,cta_type,value_basis;

comment on view public.live_revenue_action_learning is
'Internal LIVE SALES AI learning matrix by presenter/model/action/CTA. Expected-value lift is an estimated decision metric; attributed revenue remains assist attribution and is not causal proof.';

grant select on public.live_revenue_action_learning to authenticated;
