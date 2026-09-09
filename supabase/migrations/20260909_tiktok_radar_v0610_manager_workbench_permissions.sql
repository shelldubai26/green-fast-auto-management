grant select (
  manager_id,
  assignment_target_role,
  assigned_by,
  lead_quality,
  next_follow_up_at,
  invalid_reason,
  invalid_at,
  purge_after,
  last_sales_action_at
) on table public.social_leads to authenticated;
