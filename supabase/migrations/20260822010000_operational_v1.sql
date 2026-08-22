-- Green Fast Auto V1 operational schema. All tables are protected with RLS.
alter table public.vehicles
  add column if not exists trim text, add column if not exists vin text,
  add column if not exists exterior_color text, add column if not exists interior_color text,
  add column if not exists mileage numeric, add column if not exists fuel_type text,
  add column if not exists supplier text, add column if not exists china_purchase_ref text,
  add column if not exists purchase_date date, add column if not exists shipping_date date,
  add column if not exists eta_abidjan date, add column if not exists arrival_date date,
  add column if not exists purchase_price numeric, add column if not exists shipping_cost numeric default 0,
  add column if not exists customs_cost numeric default 0, add column if not exists other_costs numeric default 0,
  add column if not exists final_sale_price numeric, add column if not exists gross_profit numeric,
  add column if not exists photos text, add column if not exists documents text;
create unique index if not exists vehicles_vin_unique on public.vehicles(vin) where vin is not null;

alter table public.customers
  add column if not exists whatsapp text, add column if not exists email text,
  add column if not exists nationality text, add column if not exists lead_source text,
  add column if not exists interested_model text, add column if not exists budget numeric,
  add column if not exists stage text default 'new', add column if not exists follow_up_date timestamptz,
  add column if not exists notes text;

alter table public.orders
  add column if not exists order_number text, add column if not exists vehicle_label text,
  add column if not exists customer_name text, add column if not exists selling_price numeric,
  add column if not exists deposit_amount numeric default 0, add column if not exists payment_status text default 'unpaid';
alter table public.orders alter column sale_price drop not null;
update public.orders set selling_price=sale_price where selling_price is null;
create unique index if not exists orders_order_number_unique on public.orders(order_number) where order_number is not null;
create unique index if not exists one_active_order_per_vehicle on public.orders(vehicle_id) where status not in ('cancelled','draft');

create table if not exists public.tasks(id uuid primary key default gen_random_uuid(),title text not null,description text,assigned_to uuid references public.profiles,owner_name text,due_date timestamptz,priority text default 'medium',status text default 'todo',kpi_type text,kpi_value numeric default 0,created_by uuid default auth.uid(),created_at timestamptz default now());
create table if not exists public.content_items(id uuid primary key default gen_random_uuid(),title text not null,platform text,url text,creator_id uuid references public.profiles,creator_name text,publish_date date,views bigint default 0,inquiries int default 0,leads int default 0,appointments int default 0,sales int default 0,customer_id uuid references public.customers,order_id uuid references public.orders,created_at timestamptz default now());
create table if not exists public.price_approvals(id uuid primary key default gen_random_uuid(),vehicle_id uuid references public.vehicles,vehicle_label text,customer_id uuid references public.customers,customer_name text,asking_price numeric,requested_price numeric,reason text,status text default 'pending',decision_note text,requested_by uuid references public.profiles default auth.uid(),decided_by uuid references public.profiles,decided_at timestamptz,created_at timestamptz default now());
create table if not exists public.payments(id uuid primary key default gen_random_uuid(),order_id uuid references public.orders,customer_id uuid references public.customers,customer_name text,payment_type text,amount numeric not null default 0,method text,payment_date date,reference text,outstanding_balance numeric,verification_status text default 'pending',verified_by uuid references public.profiles,created_at timestamptz default now());
create table if not exists public.commissions(id uuid primary key default gen_random_uuid(),salesperson_id uuid references public.profiles,salesperson_name text,order_id uuid references public.orders,order_number text,selling_price numeric,commission_rate numeric,commission_amount numeric,bonus numeric default 0,salary numeric default 0,status text default 'payable',paid_at timestamptz,created_at timestamptz default now());
create table if not exists public.deliveries(id uuid primary key default gen_random_uuid(),vehicle_id uuid references public.vehicles,vehicle_label text,customer_id uuid references public.customers,customer_name text,inspection_complete boolean default false,cleaning_complete boolean default false,documents_complete boolean default false,fuel_complete boolean default false,accessories_complete boolean default false,appointment_at timestamptz,customer_confirmation text,status text default 'pending',created_at timestamptz default now());
create table if not exists public.service_requests(id uuid primary key default gen_random_uuid(),customer_id uuid references public.customers,customer_name text,vin text,issue text not null,opened_date date default current_date,responsible_id uuid references public.profiles,responsible_name text,status text default 'open',resolution text,follow_up_history text,created_at timestamptz default now());

alter table public.tasks enable row level security; alter table public.content_items enable row level security;
alter table public.price_approvals enable row level security; alter table public.payments enable row level security;
alter table public.commissions enable row level security; alter table public.deliveries enable row level security;
alter table public.service_requests enable row level security;

drop policy if exists "authenticated vehicles" on public.vehicles;
create policy "non sales view vehicle costs" on public.vehicles for select to authenticated using (public.current_role() in ('owner','manager','finance','delivery'));
create or replace view public.sales_vehicle_catalog with (security_invoker=false, security_barrier=true) as
 select id,stock_number,make,model,trim,year,vin,exterior_color,interior_color,mileage,fuel_type,supplier,china_purchase_ref,purchase_date,shipping_date,eta_abidjan,arrival_date,status,asking_price,final_sale_price,photos,documents,created_at from public.vehicles;
revoke all on public.sales_vehicle_catalog from public,anon; grant select on public.sales_vehicle_catalog to authenticated;

create policy "tasks visible to team" on public.tasks for select to authenticated using (assigned_to=auth.uid() or created_by=auth.uid() or public.current_role() in ('owner','manager'));
create policy "tasks create" on public.tasks for insert to authenticated with check (created_by=auth.uid() or public.current_role() in ('owner','manager'));
create policy "tasks update" on public.tasks for update to authenticated using (assigned_to=auth.uid() or created_by=auth.uid() or public.current_role() in ('owner','manager'));
create policy "tasks delete leadership" on public.tasks for delete to authenticated using (public.current_role() in ('owner','manager'));
create policy "content read team" on public.content_items for select to authenticated using (true);
create policy "content write assigned" on public.content_items for all to authenticated using (creator_id=auth.uid() or public.current_role() in ('owner','manager')) with check (creator_id=auth.uid() or public.current_role() in ('owner','manager'));
create policy "approvals read" on public.price_approvals for select to authenticated using (requested_by=auth.uid() or public.current_role() in ('owner','manager'));
create policy "approvals request" on public.price_approvals for insert to authenticated with check (requested_by=auth.uid() and status='pending');
create policy "approvals decide" on public.price_approvals for update to authenticated using (public.current_role() in ('owner','manager'));
create policy "approvals delete" on public.price_approvals for delete to authenticated using (public.current_role() in ('owner','manager'));
create policy "payments finance read" on public.payments for select to authenticated using (public.current_role() in ('owner','manager','finance'));
create policy "payments finance write" on public.payments for all to authenticated using (public.current_role() in ('owner','manager','finance')) with check (public.current_role() in ('owner','manager','finance'));
create policy "payroll authorized read" on public.commissions for select to authenticated using (public.current_role() in ('owner','finance'));
create policy "payroll authorized write" on public.commissions for all to authenticated using (public.current_role() in ('owner','finance')) with check (public.current_role() in ('owner','finance'));
create policy "delivery team read" on public.deliveries for select to authenticated using (public.current_role() in ('owner','manager','sales','delivery'));
create policy "delivery team write" on public.deliveries for all to authenticated using (public.current_role() in ('owner','manager','delivery')) with check (public.current_role() in ('owner','manager','delivery'));
create policy "service team read" on public.service_requests for select to authenticated using (public.current_role() in ('owner','manager','sales','delivery'));
create policy "service team write" on public.service_requests for all to authenticated using (responsible_id=auth.uid() or public.current_role() in ('owner','manager','delivery')) with check (responsible_id=auth.uid() or public.current_role() in ('owner','manager','delivery'));

-- Existing customer/order policies remain assignment-aware; add write operations.
create policy "customers insert" on public.customers for insert to authenticated with check (assigned_to=auth.uid() or public.current_role() in ('owner','manager'));
create policy "customers update" on public.customers for update to authenticated using (assigned_to=auth.uid() or public.current_role() in ('owner','manager'));
create policy "customers delete" on public.customers for delete to authenticated using (public.current_role() in ('owner','manager'));
create policy "orders insert" on public.orders for insert to authenticated with check (salesperson_id=auth.uid() or public.current_role() in ('owner','manager'));
create policy "orders update" on public.orders for update to authenticated using (salesperson_id=auth.uid() or public.current_role() in ('owner','manager','finance'));
create policy "orders delete" on public.orders for delete to authenticated using (public.current_role() in ('owner','manager'));

create or replace function public.set_vehicle_financials() returns trigger language plpgsql security definer set search_path=public as $$
begin
 new.landed_cost=coalesce(new.purchase_price,0)+coalesce(new.shipping_cost,0)+coalesce(new.customs_cost,0)+coalesce(new.other_costs,0);
 new.gross_profit=case when new.final_sale_price is null then null else new.final_sale_price-new.landed_cost end;
 return new;
end $$;
drop trigger if exists calculate_vehicle_financials on public.vehicles;
create trigger calculate_vehicle_financials before insert or update on public.vehicles for each row execute function public.set_vehicle_financials();
