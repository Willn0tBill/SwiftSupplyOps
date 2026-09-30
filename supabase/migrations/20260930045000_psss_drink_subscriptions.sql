-- SwiftSupply PSSS monthly drink passes.
-- Weekly Pass: $12/month, 4 credits, max 1 redemption per rolling 7 days.
-- Plus Pass: $22/month, 8 credits, max 2 redemptions per rolling 7 days.

create sequence if not exists public.ops_psss_pass_seq;

create table if not exists public.ops_psss_subscriptions (
  id uuid primary key default gen_random_uuid(),
  pass_code text not null unique default (
    'PASS-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.ops_psss_pass_seq')::text, 5, '0')
  ),
  subscriber_name text not null,
  plan_code text not null check (plan_code in ('weekly','plus')),
  plan_name text not null,
  monthly_price numeric(12,2) not null check (monthly_price >= 0),
  monthly_credits integer not null check (monthly_credits > 0),
  weekly_limit integer not null check (weekly_limit > 0),
  credits_remaining integer not null check (credits_remaining >= 0),
  current_period_start date not null default current_date,
  current_period_end date not null,
  status text not null default 'active' check (status in ('active','paused','cancelled')),
  payment_method text not null default 'Cash' check (payment_method in ('Cash','Apple Cash','Zelle','Card','Other')),
  account text not null default 'SS Cash' check (account in ('SS Cash','SS Bank','Apple Cash','Personal Account','Other')),
  last_paid_at timestamptz not null default now(),
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (current_period_end > current_period_start),
  check (credits_remaining <= monthly_credits)
);

create table if not exists public.ops_psss_subscription_redemptions (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.ops_psss_subscriptions(id) on delete cascade,
  product_id uuid not null references public.ops_products(id),
  redeemed_at timestamptz not null default now(),
  unit_cost numeric(12,4) not null default 0 check (unit_cost >= 0),
  period_start date not null,
  recorded_by uuid,
  notes text
);

create index if not exists ops_psss_subscriptions_status_idx
  on public.ops_psss_subscriptions(status, current_period_end);
create index if not exists ops_psss_subscription_redemptions_sub_idx
  on public.ops_psss_subscription_redemptions(subscription_id, redeemed_at desc);
create index if not exists ops_psss_subscription_redemptions_product_idx
  on public.ops_psss_subscription_redemptions(product_id, redeemed_at desc);

alter table public.ops_psss_subscriptions enable row level security;
alter table public.ops_psss_subscription_redemptions enable row level security;

drop policy if exists ops_psss_subscriptions_select on public.ops_psss_subscriptions;
create policy ops_psss_subscriptions_select on public.ops_psss_subscriptions
for select using (public.ops_current_role() = any (array['owner','manager','employee','intern']));

drop policy if exists ops_psss_subscription_redemptions_select on public.ops_psss_subscription_redemptions;
create policy ops_psss_subscription_redemptions_select on public.ops_psss_subscription_redemptions
for select using (public.ops_current_role() = any (array['owner','manager','employee','intern']));

grant select on public.ops_psss_subscriptions to authenticated;
grant select on public.ops_psss_subscription_redemptions to authenticated;

-- Keep normal Ops auditing/timestamps consistent with the rest of the app.
drop trigger if exists ops_psss_subscriptions_touch on public.ops_psss_subscriptions;
create trigger ops_psss_subscriptions_touch
before update on public.ops_psss_subscriptions
for each row execute function public.ops_touch_updated_at();

drop trigger if exists ops_psss_subscriptions_audit on public.ops_psss_subscriptions;
create trigger ops_psss_subscriptions_audit
after insert or update or delete on public.ops_psss_subscriptions
for each row execute function public.ops_audit_change();

drop trigger if exists ops_psss_subscription_redemptions_audit on public.ops_psss_subscription_redemptions;
create trigger ops_psss_subscription_redemptions_audit
after insert or update or delete on public.ops_psss_subscription_redemptions
for each row execute function public.ops_audit_change();

create or replace function public.ops_create_psss_subscription(
  p_subscriber_name text,
  p_plan_code text,
  p_payment_method text default 'Cash',
  p_account text default 'SS Cash',
  p_notes text default null
)
returns public.ops_psss_subscriptions
language plpgsql
security definer
set search_path = ''
as $function$
declare
  s public.ops_psss_subscriptions;
  r text;
  v_name text;
  v_price numeric(12,2);
  v_credits integer;
  v_weekly integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  r := public.ops_current_role();
  if r is null or r not in ('owner','manager','employee','intern') then raise exception 'Staff approval required'; end if;
  if nullif(btrim(p_subscriber_name),'') is null then raise exception 'Enter the subscriber name'; end if;
  if p_payment_method not in ('Cash','Apple Cash','Zelle','Card','Other') then raise exception 'Choose a valid payment method'; end if;
  if p_account not in ('SS Cash','SS Bank','Apple Cash','Personal Account','Other') then raise exception 'Choose a valid deposit account'; end if;

  case p_plan_code
    when 'weekly' then
      v_name := 'Weekly Pass'; v_price := 12.00; v_credits := 4; v_weekly := 1;
    when 'plus' then
      v_name := 'Plus Pass'; v_price := 22.00; v_credits := 8; v_weekly := 2;
    else
      raise exception 'Choose Weekly Pass or Plus Pass';
  end case;

  insert into public.ops_psss_subscriptions(
    subscriber_name, plan_code, plan_name, monthly_price, monthly_credits,
    weekly_limit, credits_remaining, current_period_start, current_period_end,
    status, payment_method, account, last_paid_at, notes, created_by
  ) values (
    btrim(p_subscriber_name), p_plan_code, v_name, v_price, v_credits,
    v_weekly, v_credits, current_date, (current_date + interval '1 month')::date,
    'active', p_payment_method, p_account, now(), p_notes, auth.uid()
  ) returning * into s;

  insert into public.ops_transactions(
    account,direction,status,amount,source_category,business_area,source_type,source_id,notes,recorded_by
  ) values (
    p_account,'In','Cleared',v_price,'PSSS Subscription','Personal Selling',
    'psss_subscription_payment',s.id,
    s.pass_code || ' • ' || s.subscriber_name || ' • ' || v_name,
    auth.uid()
  );

  return s;
end;
$function$;

create or replace function public.ops_renew_psss_subscription(
  p_subscription_id uuid,
  p_payment_method text default 'Cash',
  p_account text default 'SS Cash'
)
returns public.ops_psss_subscriptions
language plpgsql
security definer
set search_path = ''
as $function$
declare
  s public.ops_psss_subscriptions;
  r text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  r := public.ops_current_role();
  if r is null or r not in ('owner','manager','employee','intern') then raise exception 'Staff approval required'; end if;
  if p_payment_method not in ('Cash','Apple Cash','Zelle','Card','Other') then raise exception 'Choose a valid payment method'; end if;
  if p_account not in ('SS Cash','SS Bank','Apple Cash','Personal Account','Other') then raise exception 'Choose a valid deposit account'; end if;

  select * into s from public.ops_psss_subscriptions where id=p_subscription_id for update;
  if not found then raise exception 'Subscription not found'; end if;
  if s.status='cancelled' then raise exception 'Cancelled passes cannot be renewed. Create a new pass instead.'; end if;

  update public.ops_psss_subscriptions
  set current_period_start=current_date,
      current_period_end=(current_date + interval '1 month')::date,
      credits_remaining=monthly_credits,
      status='active',
      payment_method=p_payment_method,
      account=p_account,
      last_paid_at=now()
  where id=s.id
  returning * into s;

  insert into public.ops_transactions(
    account,direction,status,amount,source_category,business_area,source_type,source_id,notes,recorded_by
  ) values (
    p_account,'In','Cleared',s.monthly_price,'PSSS Subscription','Personal Selling',
    'psss_subscription_payment',s.id,
    s.pass_code || ' • renewal • ' || s.subscriber_name || ' • ' || s.plan_name,
    auth.uid()
  );

  return s;
end;
$function$;

create or replace function public.ops_set_psss_subscription_status(
  p_subscription_id uuid,
  p_status text
)
returns public.ops_psss_subscriptions
language plpgsql
security definer
set search_path = ''
as $function$
declare
  s public.ops_psss_subscriptions;
  r text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  r := public.ops_current_role();
  if r is null or r not in ('owner','manager') then raise exception 'Owner or manager access required'; end if;
  if p_status not in ('active','paused','cancelled') then raise exception 'Choose active, paused, or cancelled'; end if;

  update public.ops_psss_subscriptions
  set status=p_status
  where id=p_subscription_id
  returning * into s;
  if not found then raise exception 'Subscription not found'; end if;
  return s;
end;
$function$;

create or replace function public.ops_redeem_psss_subscription(
  p_subscription_id uuid,
  p_product_id uuid,
  p_notes text default null
)
returns public.ops_psss_subscription_redemptions
language plpgsql
security definer
set search_path = ''
as $function$
declare
  s public.ops_psss_subscriptions;
  p public.ops_products;
  red public.ops_psss_subscription_redemptions;
  r text;
  recent_redemptions integer;
  reserved_qty integer;
  movement_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  r := public.ops_current_role();
  if r is null or r not in ('owner','manager','employee','intern') then raise exception 'Staff approval required'; end if;

  select * into s from public.ops_psss_subscriptions where id=p_subscription_id for update;
  if not found then raise exception 'Subscription not found'; end if;
  if s.status<>'active' then raise exception 'This pass is not active'; end if;
  if current_date >= s.current_period_end then raise exception 'This pass period has ended. Renew it before redeeming another drink.'; end if;
  if s.credits_remaining <= 0 then raise exception 'No drink credits remain for this period'; end if;

  select count(*)::integer into recent_redemptions
  from public.ops_psss_subscription_redemptions
  where subscription_id=s.id
    and redeemed_at >= greatest(now() - interval '7 days', s.current_period_start::timestamptz);
  if recent_redemptions >= s.weekly_limit then
    raise exception 'Weekly redemption limit reached. Try again after the 7-day window moves forward.';
  end if;

  select * into p from public.ops_products where id=p_product_id for update;
  if not found or p.business_unit<>'PSSS' or not p.active then raise exception 'Choose an active PSSS drink'; end if;

  select coalesce(sum(oi.quantity),0)::integer into reserved_qty
  from public.ops_psss_order_items oi
  join public.ops_psss_orders o on o.id=oi.order_id
  where oi.product_id=p.id and o.fulfillment_status='preorder';

  if p.current_stock - reserved_qty < 1 then
    raise exception 'No unreserved % is available right now', p.name;
  end if;

  update public.ops_products
  set current_stock=current_stock-1, updated_at=now()
  where id=p.id and current_stock-reserved_qty >= 1;
  if not found then raise exception 'Inventory changed. Refresh and try again.'; end if;

  insert into public.ops_psss_subscription_redemptions(
    subscription_id, product_id, unit_cost, period_start, recorded_by, notes
  ) values (
    s.id, p.id, coalesce(p.unit_cost,0), s.current_period_start, auth.uid(), p_notes
  ) returning * into red;

  update public.ops_psss_subscriptions
  set credits_remaining=credits_remaining-1
  where id=s.id;

  select id into movement_id
  from public.ops_inventory_movements
  where product_id=p.id
  order by created_at desc
  limit 1;
  if movement_id is not null then
    update public.ops_inventory_movements
    set movement_type='subscription_redemption',
        unit_cost=coalesce(p.unit_cost,0),
        source_type='psss_subscription_redemption',
        source_id=s.id,
        notes=concat_ws(' • ', s.pass_code, s.subscriber_name, p.name, nullif(p_notes,''))
    where id=movement_id;
  end if;

  return red;
end;
$function$;

grant execute on function public.ops_create_psss_subscription(text,text,text,text,text) to authenticated;
grant execute on function public.ops_renew_psss_subscription(uuid,text,text) to authenticated;
grant execute on function public.ops_set_psss_subscription_status(uuid,text) to authenticated;
grant execute on function public.ops_redeem_psss_subscription(uuid,uuid,text) to authenticated;

-- Include pass payments as PSSS earned/collected revenue and redemptions as COGS.
create or replace view public.ops_psss_profit_summary as
with sales as (
  select
    coalesce((select sum(total_amount) from public.ops_psss_sales),0)::numeric
      + coalesce((select sum(amount) from public.ops_transactions where business_area='Personal Selling' and direction='In' and status='Cleared' and source_type='psss_subscription_payment'),0)::numeric as sales_earned,
    coalesce((select sum(collected_amount) from public.ops_psss_sales),0)::numeric
      + coalesce((select sum(amount) from public.ops_transactions where business_area='Personal Selling' and direction='In' and status='Cleared' and source_type='psss_subscription_payment'),0)::numeric as collected,
    coalesce((select sum(total_amount-collected_amount) from public.ops_psss_sales),0)::numeric as owed
),
cogs as (
  select
    coalesce((select sum(quantity::numeric * unit_cost) from public.ops_psss_sale_items),0)::numeric
      + coalesce((select sum(unit_cost) from public.ops_psss_subscription_redemptions),0)::numeric as cogs
),
damage as (
  select coalesce(sum(abs(quantity_delta)::numeric * unit_cost),0)::numeric as damage_cost
  from public.ops_inventory_movements
  where business_unit='PSSS' and movement_type=any(array['damaged','waste'])
),
inventory as (
  select coalesce(sum(current_stock::numeric * unit_cost),0)::numeric as inventory_value,
         coalesce(sum(current_stock),0::bigint)::integer as units_on_hand
  from public.ops_products
  where business_unit='PSSS' and active is not false
),
purchases as (
  select coalesce(sum(amount),0)::numeric as inventory_spend
  from public.ops_transactions
  where business_area='Personal Selling' and direction='Out' and status='Cleared' and source_type='inventory_purchase'
)
select s.sales_earned,
       s.collected,
       s.owed,
       c.cogs,
       s.sales_earned-c.cogs as gross_profit,
       d.damage_cost,
       s.sales_earned-c.cogs-d.damage_cost as merchandise_profit,
       i.inventory_value,
       i.units_on_hand,
       p.inventory_spend
from sales s cross join cogs c cross join damage d cross join inventory i cross join purchases p;
