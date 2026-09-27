-- SwiftSupply Ops v2: real calendar + inventory movement history
-- Non-destructive additions for the existing Ops schema.

create table if not exists public.ops_calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  event_type text not null default 'general',
  business_area text not null default 'General',
  status text not null default 'scheduled',
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  related_table text,
  related_id uuid,
  assigned_to uuid references public.ops_profiles(id) on delete set null,
  notes text,
  created_by uuid references public.ops_profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ops_calendar_event_time_check check (ends_at is null or ends_at >= starts_at),
  constraint ops_calendar_event_status_check check (status in ('scheduled','in_progress','completed','cancelled'))
);

create index if not exists ops_calendar_events_starts_at_idx on public.ops_calendar_events(starts_at);
create index if not exists ops_calendar_events_assigned_to_idx on public.ops_calendar_events(assigned_to);
create index if not exists ops_calendar_events_related_idx on public.ops_calendar_events(related_table, related_id);

alter table public.ops_calendar_events enable row level security;

drop policy if exists ops_calendar_select on public.ops_calendar_events;
create policy ops_calendar_select on public.ops_calendar_events
for select to authenticated
using (public.ops_current_role() in ('owner','manager','employee','intern'));

drop policy if exists ops_calendar_insert on public.ops_calendar_events;
create policy ops_calendar_insert on public.ops_calendar_events
for insert to authenticated
with check (
  public.ops_current_role() in ('owner','manager','employee','intern')
  and created_by = (select auth.uid())
);

drop policy if exists ops_calendar_update on public.ops_calendar_events;
create policy ops_calendar_update on public.ops_calendar_events
for update to authenticated
using (
  public.ops_current_role() in ('owner','manager')
  or (
    public.ops_current_role() in ('employee','intern')
    and (created_by = (select auth.uid()) or assigned_to = (select auth.uid()))
  )
)
with check (public.ops_current_role() in ('owner','manager','employee','intern'));

drop policy if exists ops_calendar_delete on public.ops_calendar_events;
create policy ops_calendar_delete on public.ops_calendar_events
for delete to authenticated
using (public.ops_current_role() in ('owner','manager'));

grant select, insert, update, delete on public.ops_calendar_events to authenticated;
revoke all on public.ops_calendar_events from anon;

create table if not exists public.ops_inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.ops_products(id) on delete restrict,
  business_unit text not null,
  movement_type text not null default 'stock_change',
  quantity_delta integer not null,
  stock_before integer not null,
  stock_after integer not null,
  unit_cost numeric not null default 0,
  source_type text,
  source_id uuid,
  notes text,
  recorded_by uuid references public.ops_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint ops_inventory_delta_check check (quantity_delta <> 0),
  constraint ops_inventory_stock_check check (stock_before >= 0 and stock_after >= 0),
  constraint ops_inventory_math_check check (stock_after = stock_before + quantity_delta)
);

create index if not exists ops_inventory_movements_product_idx on public.ops_inventory_movements(product_id, created_at desc);
create index if not exists ops_inventory_movements_business_idx on public.ops_inventory_movements(business_unit, created_at desc);

alter table public.ops_inventory_movements enable row level security;

drop policy if exists ops_inventory_select on public.ops_inventory_movements;
create policy ops_inventory_select on public.ops_inventory_movements
for select to authenticated
using (public.ops_current_role() in ('owner','manager','employee','intern'));

drop policy if exists ops_inventory_insert on public.ops_inventory_movements;
create policy ops_inventory_insert on public.ops_inventory_movements
for insert to authenticated
with check (public.ops_current_role() in ('owner','manager'));

grant select, insert on public.ops_inventory_movements to authenticated;
revoke all on public.ops_inventory_movements from anon;

create or replace function public.ops_log_stock_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.current_stock is distinct from old.current_stock then
    insert into public.ops_inventory_movements(
      product_id, business_unit, movement_type, quantity_delta,
      stock_before, stock_after, unit_cost, source_type, recorded_by
    ) values (
      new.id, new.business_unit, 'stock_change', new.current_stock - old.current_stock,
      old.current_stock, new.current_stock, new.unit_cost, 'product_stock_update', auth.uid()
    );
  end if;
  return new;
end;
$$;

drop trigger if exists ops_products_stock_movement on public.ops_products;
create trigger ops_products_stock_movement
after update of current_stock on public.ops_products
for each row execute function public.ops_log_stock_change();

create or replace function public.ops_adjust_inventory(
  p_product_id uuid,
  p_quantity_delta integer,
  p_movement_type text default 'adjustment',
  p_notes text default null
) returns public.ops_products
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.ops_products;
  r text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  r := public.ops_current_role();
  if r not in ('owner','manager') then raise exception 'Owner or manager access required'; end if;
  if p_quantity_delta is null or p_quantity_delta = 0 then raise exception 'Quantity change cannot be zero'; end if;

  select * into p from public.ops_products where id = p_product_id for update;
  if not found then raise exception 'Product not found'; end if;
  if p.current_stock + p_quantity_delta < 0 then raise exception 'Inventory cannot go below zero'; end if;

  update public.ops_products
  set current_stock = current_stock + p_quantity_delta, updated_at = now()
  where id = p_product_id
  returning * into p;

  update public.ops_inventory_movements
  set movement_type = coalesce(nullif(p_movement_type,''),'adjustment'),
      notes = p_notes,
      source_type = 'manual_adjustment'
  where id = (
    select id from public.ops_inventory_movements
    where product_id = p_product_id and recorded_by = auth.uid()
    order by created_at desc limit 1
  );

  return p;
end;
$$;
revoke all on function public.ops_adjust_inventory(uuid,integer,text,text) from public, anon;
grant execute on function public.ops_adjust_inventory(uuid,integer,text,text) to authenticated;

-- Reuse existing shared timestamp/audit infrastructure where available.
drop trigger if exists ops_calendar_events_touch on public.ops_calendar_events;
create trigger ops_calendar_events_touch before update on public.ops_calendar_events
for each row execute function public.ops_touch_updated_at();

drop trigger if exists ops_calendar_events_audit on public.ops_calendar_events;
create trigger ops_calendar_events_audit after insert or update or delete on public.ops_calendar_events
for each row execute function public.ops_audit_change();

drop trigger if exists ops_inventory_movements_audit on public.ops_inventory_movements;
create trigger ops_inventory_movements_audit after insert or update or delete on public.ops_inventory_movements
for each row execute function public.ops_audit_change();

-- Customers should be auditable too; this was missing from the original trigger set.
drop trigger if exists ops_customers_audit on public.ops_customers;
create trigger ops_customers_audit after insert or update or delete on public.ops_customers
for each row execute function public.ops_audit_change();

notify pgrst, 'reload schema';
