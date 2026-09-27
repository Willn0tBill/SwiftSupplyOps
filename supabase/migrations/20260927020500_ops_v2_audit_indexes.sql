-- SwiftSupply Ops v2 follow-up: audit staff changes and cover new foreign keys.
create index if not exists ops_calendar_events_created_by_idx on public.ops_calendar_events(created_by);
create index if not exists ops_inventory_movements_recorded_by_idx on public.ops_inventory_movements(recorded_by);
create index if not exists ops_profiles_access_denied_by_idx on public.ops_profiles(access_denied_by);
create index if not exists ops_profiles_deactivated_by_idx on public.ops_profiles(deactivated_by);

drop trigger if exists ops_profiles_audit on public.ops_profiles;
create trigger ops_profiles_audit
after insert or update or delete on public.ops_profiles
for each row execute function public.ops_audit_change();

notify pgrst, 'reload schema';
