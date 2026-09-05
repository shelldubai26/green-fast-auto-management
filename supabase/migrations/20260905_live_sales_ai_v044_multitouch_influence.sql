-- LIVE SALES AI V0.4.4 — multi-touch influence model
-- This is an analytical heuristic, not a causal attribution model.
-- Primary revenue accounting remains unchanged and is still counted only once.

create or replace view public.live_multitouch_influence as
with eligible as (
  select
    ll.customer_id,
    ll.sale_id,
    ll.session_id,
    ls.presenter_id,
    coalesce(ls.started_at,ll.created_at) as touch_at,
    ll.won_at,
    ll.sale_price_xof,
    row_number() over (
      partition by ll.customer_id,ll.sale_id
      order by coalesce(ls.started_at,ll.created_at) asc, ll.id asc
    ) as touch_position,
    count(*) over (partition by ll.customer_id,ll.sale_id) as touch_count
  from public.live_leads ll
  join public.live_sessions ls on ls.id=ll.session_id
  where ll.customer_id is not null
    and ll.sale_id is not null
    and ll.won_at is not null
    and coalesce(ls.started_at,ll.created_at) <= ll.won_at
), weighted as (
  select *,
    case
      when touch_count=1 then 1.0
      when touch_count=2 and touch_position=1 then 0.35
      when touch_count=2 and touch_position=2 then 0.65
      when touch_count>2 and touch_position=1 then 0.25
      when touch_count>2 and touch_position=touch_count then 0.50
      when touch_count>2 then 0.25/(touch_count-2)
      else 0
    end::numeric as influence_weight
  from eligible
)
select
  customer_id,
  sale_id,
  session_id,
  presenter_id,
  touch_at,
  won_at,
  greatest(0,extract(epoch from (won_at-touch_at))/86400.0)::numeric as days_before_sale,
  touch_position,
  touch_count,
  case
    when touch_count=1 then 'single'
    when touch_position=1 then 'first_touch'
    when touch_position=touch_count then 'last_touch'
    else 'assist_touch'
  end as influence_role,
  influence_weight,
  coalesce(sale_price_xof,0)::numeric as sale_price_xof,
  (coalesce(sale_price_xof,0)*influence_weight)::numeric as influence_value_xof
from weighted;

comment on view public.live_multitouch_influence is
'LIVE SALES AI analytical multi-touch influence model. Weights are heuristic for learning/analysis only; they do not replace primary accounting attribution.';
