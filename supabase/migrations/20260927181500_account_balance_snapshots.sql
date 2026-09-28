create table if not exists public.ops_account_balances (
  account text primary key,
  balance numeric(12,2) not null default 0,
  notes text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.ops_profiles(id)
);

alter table public.ops_account_balances enable row level security;

create policy "ops_account_balances_select"
on public.ops_account_balances for select
to authenticated
using (public.ops_current_role() = any (array['owner'::text,'manager'::text]));

create policy "ops_account_balances_insert"
on public.ops_account_balances for insert
to authenticated
with check (public.ops_current_role() = any (array['owner'::text,'manager'::text]));

create policy "ops_account_balances_update"
on public.ops_account_balances for update
to authenticated
using (public.ops_current_role() = any (array['owner'::text,'manager'::text]))
with check (public.ops_current_role() = any (array['owner'::text,'manager'::text]));
