create or replace function public.ops_sheet_sync_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r text;
  webhook text;
  shared_secret text;
  pending_count integer := 0;
  failed_count integer := 0;
  synced_count integer := 0;
  latest_error text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  r := public.ops_current_role();
  if r not in ('owner','manager') then raise exception 'Owner or manager access required'; end if;

  select value into webhook from public.ops_private_settings where key='google_sheets_webhook_url';
  select value into shared_secret from public.ops_private_settings where key='google_sheets_shared_secret';

  select count(*) filter (where status='pending'),
         count(*) filter (where status='failed'),
         count(*) filter (where status='synced')
    into pending_count, failed_count, synced_count
  from public.ops_sync_queue;

  select last_error into latest_error
  from public.ops_sync_queue
  where last_error is not null
  order by created_at desc
  limit 1;

  return jsonb_build_object(
    'configured', coalesce(webhook,'') <> '' and coalesce(shared_secret,'') <> '',
    'webhook_configured', coalesce(webhook,'') <> '',
    'shared_secret_configured', coalesce(shared_secret,'') <> '',
    'webhook_url', case when r='owner' then webhook else null end,
    'pending', pending_count,
    'failed', failed_count,
    'synced', synced_count,
    'last_error', latest_error
  );
end;
$$;

revoke all on function public.ops_sheet_sync_status() from public, anon;
grant execute on function public.ops_sheet_sync_status() to authenticated;

create or replace function public.ops_set_google_sheets_webhook(p_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if public.ops_current_role() <> 'owner' then raise exception 'Owner access required'; end if;
  if p_url is null or btrim(p_url) = '' then raise exception 'Webhook URL is required'; end if;
  if btrim(p_url) !~ '^https://script\.google\.com/.*/exec([?].*)?$' then
    raise exception 'Use the deployed Google Apps Script Web App /exec URL';
  end if;

  insert into public.ops_private_settings(key,value,updated_at)
  values('google_sheets_webhook_url', btrim(p_url), now())
  on conflict (key) do update set value=excluded.value, updated_at=now();
end;
$$;

revoke all on function public.ops_set_google_sheets_webhook(text) from public, anon;
grant execute on function public.ops_set_google_sheets_webhook(text) to authenticated;

create or replace function public.ops_set_google_sheets_shared_secret(p_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if public.ops_current_role() <> 'owner' then raise exception 'Owner access required'; end if;
  if p_secret is null or length(btrim(p_secret)) < 24 then raise exception 'Shared secret must be at least 24 characters'; end if;

  insert into public.ops_private_settings(key,value,updated_at)
  values('google_sheets_shared_secret', btrim(p_secret), now())
  on conflict (key) do update set value=excluded.value, updated_at=now();
end;
$$;

revoke all on function public.ops_set_google_sheets_shared_secret(text) from public, anon;
grant execute on function public.ops_set_google_sheets_shared_secret(text) to authenticated;

notify pgrst, 'reload schema';
