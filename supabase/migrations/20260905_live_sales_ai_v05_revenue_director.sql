-- LIVE SALES AI V0.5 — Revenue AI Director data layer
-- Uses real vehicle economics when available. When cost data is missing, UI must fall back to revenue proxy and label it clearly.

create or replace view public.live_revenue_model_economics as
with normalized as (
  select
    case
      when lower(coalesce(model,'')) like '%cs55%' then 'CS55'
      when lower(coalesce(model,'')) like '%cs75%' then 'CS75'
      when lower(coalesce(model,'')) like '%gs3%' or lower(coalesce(model,'')) like '%影速%' then 'GS3'
      when lower(coalesce(model,'')) like '%t2%' or lower(coalesce(model,'')) like '%山海%' then 'T2'
      when lower(coalesce(model,'')) like '%m817%' then 'M817'
      when lower(coalesce(model,'')) like '%song pro%' or lower(coalesce(model,'')) like '%宋pro%' then 'SONG PRO'
      when lower(coalesce(model,'')) like '%钛7%' or lower(coalesce(model,'')) like '%tai 7%' then 'TAI 7'
      when lower(coalesce(model,'')) like '%领克900%' or lower(coalesce(model,'')) like '%lynk%' then 'LYNK 900'
      else upper(left(coalesce(nullif(model,''),'UNKNOWN'),40))
    end as model_key,
    status::text as status,
    coalesce(landed_cost_xof,landed_cost) as landed_cost,
    coalesce(target_price_xof,asking_price,list_price_xof) as target_price,
    nullif(gross_profit,0) as gross_profit
  from public.vehicles
)
select
  model_key,
  count(*)::int as units_total,
  count(*) filter (where status='in_transit')::int as units_in_transit,
  count(*) filter (where status='ordered')::int as units_ordered,
  count(*) filter (where status='in_stock')::int as units_in_stock,
  avg(target_price)::numeric as avg_target_price_xof,
  avg(landed_cost)::numeric as avg_landed_cost_xof,
  avg(gross_profit)::numeric as avg_gross_profit_xof,
  count(gross_profit)::int as gross_profit_samples,
  count(landed_cost)::int as landed_cost_samples
from normalized
group by model_key;

create or replace view public.live_revenue_model_performance with (security_invoker=true) as
with normalized as (
  select
    case
      when lower(coalesce(interested_model,'')) like '%cs55%' then 'CS55'
      when lower(coalesce(interested_model,'')) like '%cs75%' then 'CS75'
      when lower(coalesce(interested_model,'')) like '%gs3%' then 'GS3'
      when lower(coalesce(interested_model,'')) like '%t2%' then 'T2'
      when lower(coalesce(interested_model,'')) like '%m817%' then 'M817'
      when lower(coalesce(interested_model,'')) like '%song pro%' then 'SONG PRO'
      else upper(coalesce(nullif(interested_model,''),'UNKNOWN'))
    end as model_key,
    appointment_at, visited_at, test_drive_at, deposit_at, won_at, sale_price_xof
  from public.live_leads
)
select
  model_key,
  count(*)::int as leads,
  count(*) filter (where appointment_at is not null)::int as appointments,
  count(*) filter (where visited_at is not null)::int as visits,
  count(*) filter (where test_drive_at is not null)::int as test_drives,
  count(*) filter (where deposit_at is not null)::int as deposits,
  count(*) filter (where won_at is not null)::int as sales,
  coalesce(sum(sale_price_xof),0)::numeric as revenue_xof
from normalized
group by model_key;

comment on view public.live_revenue_model_economics is 'Real Green Fast vehicle economics grouped into LIVE SALES AI model keys. Gross profit may be null when cost data is incomplete.';
comment on view public.live_revenue_model_performance is 'Observed LIVE lead funnel performance by model under current RLS. Used by Revenue AI Director with Bayesian baseline when sample size is small.';

grant select on public.live_revenue_model_economics to authenticated;
grant select on public.live_revenue_model_performance to authenticated;
