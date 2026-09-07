create or replace function public.gf_seller_priority_followups(p_profile_id uuid, p_limit integer default 5)
returns table(customer_id uuid,customer_name text,whatsapp text,stage text,interested_model text,intent_score integer,followup_due timestamptz,priority_score integer,priority_reason text,suggested_script_fr text,suggested_script_zh text)
language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is not null and not public.gf_can_view_tiktok_profile(p_profile_id) then raise exception 'not allowed'; end if;
  return query
  with ranked as (
    select c.id,coalesce(nullif(c.full_name,''),nullif(c.name,''),'TikTok Lead') as cname,
      public.gf_normalize_phone_e164(coalesce(c.whatsapp,c.phone)) as w,coalesce(c.stage,'new') as st,c.interested_model,
      coalesce(c.intent_score,0) as intent,coalesce(c.follow_up_date,c.next_followup) as due,
      (case when coalesce(c.follow_up_date,c.next_followup) is not null and coalesce(c.follow_up_date,c.next_followup)<now() then 45 else 0 end +
       case coalesce(c.stage,'new') when 'negotiation' then 35 when 'contacted' then 25 when 'new' then 15 else 5 end +
       least(coalesce(c.intent_score,0),100)/5 +
       case when c.deposit_at is not null then 40 when c.visited_at is not null then 25 when c.first_contact_at is not null then 10 else 0 end)::int as score
    from public.customers c
    where (c.assigned_sales=p_profile_id or c.assigned_to=p_profile_id) and coalesce(c.stage,'new') not in ('won','lost','closed','sold')
  )
  select r.id,r.cname,r.w,r.st,r.interested_model,r.intent,r.due,r.score,
    case when r.due is not null and r.due<now() then 'overdue_followup' when r.st='negotiation' then 'negotiation' when r.intent>=80 then 'high_intent' when r.st='contacted' then 'contacted_needs_next_step' else 'new_lead' end,
    case when r.st='negotiation' then 'Bonjour, je reviens vers vous pour avancer sur votre projet auto. Souhaitez-vous que je vous confirme aujourd’hui le prix, le stock et les prochaines étapes ?' when r.due is not null and r.due<now() then 'Bonjour, je reviens vers vous comme convenu. Êtes-vous toujours disponible pour avancer sur votre projet auto aujourd’hui ?' when r.intent>=80 then 'Bonjour, j’ai bien noté votre intérêt. Je peux vous confirmer rapidement le prix, le stock et organiser un essai si vous le souhaitez.' when r.st='contacted' then 'Bonjour, suite à notre échange, quelle serait la meilleure prochaine étape pour vous : prix final, financement, visite ou essai ?' else 'Bonjour, merci pour votre intérêt chez Green Fast Auto. Quel modèle recherchez-vous et pour quand prévoyez-vous votre achat ?' end,
    case when r.st='negotiation' then '您好，我跟进一下您的购车计划。今天我可以帮您确认价格、库存和下一步安排，您方便继续推进吗？' when r.due is not null and r.due<now() then '您好，按之前的沟通我来跟进一下。您今天还方便继续推进购车计划吗？' when r.intent>=80 then '您好，看到您购车意向比较明确。我可以马上帮您确认价格、库存，并安排试驾。' when r.st='contacted' then '您好，接着我们之前的沟通，您下一步最想确认的是最终价格、金融方案、到店还是试驾？' else '您好，感谢您关注 Green Fast Auto。您目前主要考虑哪款车，计划什么时候购买？' end
  from ranked r order by r.score desc,r.due nulls last,r.intent desc limit greatest(1,least(coalesce(p_limit,5),10));
end $$;
grant execute on function public.gf_seller_priority_followups(uuid,integer) to authenticated;
