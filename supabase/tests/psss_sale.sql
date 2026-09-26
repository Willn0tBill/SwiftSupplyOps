-- Run through a privileged test connection. Every fixture is rolled back.
begin;
select set_config('request.jwt.claims', jsonb_build_object('sub',
  (select id from public.ops_profiles where active and role='owner' order by created_at limit 1),
  'role','authenticated')::text,true);
set local role authenticated;
do $$
declare
  pid uuid;
  original_stock integer;
  original_sales bigint;
  original_transactions bigint;
  s public.ops_psss_sales;
  again public.ops_psss_sales;
  request uuid := gen_random_uuid();
  items jsonb;
  rejected boolean;
begin
  select id,current_stock into pid,original_stock from public.ops_products
    where business_unit='PSSS' and active and current_stock>=4 order by id limit 1;
  assert pid is not null, 'Need a stocked PSSS product';
  select count(*) into original_sales from public.ops_psss_sales;
  select count(*) into original_transactions from public.ops_transactions;
  items := jsonb_build_array(jsonb_build_object('product_id',pid,'quantity',1,'unit_price',2));
  s := public.ops_record_psss_sale(items,2,2,'Cash','paid','SS Cash',null,'Rollback test',request);
  again := public.ops_record_psss_sale(items,2,2,'Cash','paid','SS Cash',null,'Rollback test',request);
  assert s.id=again.id, 'Retry must return same sale';
  assert (select current_stock from public.ops_products where id=pid)=original_stock-1, 'Retry must not deduct stock twice';
  assert (select count(*) from public.ops_transactions where source_id=s.id)=1, 'Retry must not duplicate money';
  assert (select sum(line_total) from public.ops_psss_sale_items where sale_id=s.id)=2, 'Items must equal sale';
  rejected := false;
  begin
    perform public.ops_record_psss_sale(items,2,0,'Cash','pending','SS Cash',null,'Rollback test',request);
  exception when others then rejected := true; end;
  assert rejected, 'Changed retry payload must fail';
  s := public.ops_record_psss_sale(items,2,0.75,'Cash','partial','SS Cash',null,'Rollback partial',gen_random_uuid());
  assert (select sum(amount) from public.ops_transactions where source_id=s.id and status='Cleared')=0.75;
  assert (select sum(amount) from public.ops_transactions where source_id=s.id and status='Pending')=1.25;
  s := public.ops_record_psss_sale(items,2,0,'Cash','pending','SS Cash',null,'Rollback owed',gen_random_uuid());
  assert (select sum(amount) from public.ops_transactions where source_id=s.id and status='Pending')=2;
  assert not exists(select 1 from public.ops_transactions where source_id=s.id and status='Cleared');
  rejected := false;
  begin
    perform public.ops_record_psss_sale(jsonb_build_array(
      jsonb_build_object('product_id',pid,'quantity',1,'unit_price',2),
      jsonb_build_object('product_id',pid,'quantity',original_stock+1,'unit_price',2)),
      (original_stock+2)*2,(original_stock+2)*2,'Cash','paid');
  exception when others then rejected := true; end;
  assert rejected, 'Overselling must fail';
  assert (select current_stock from public.ops_products where id=pid)=original_stock-3, 'Failure must roll back earlier item deduction';
  assert (select count(*) from public.ops_psss_sales)=original_sales+3, 'Failure must not leave a sale';
  assert (select count(*) from public.ops_transactions)=original_transactions+4, 'Failure must not leave ledger entries';
  rejected := false;
  begin perform public.ops_record_psss_sale('[]',2,2,'Cash','paid'); exception when others then rejected := true; end;
  assert rejected, 'Empty carts must fail';
  rejected := false;
  begin perform public.ops_record_psss_sale(items,1,1,'Cash','paid'); exception when others then rejected := true; end;
  assert rejected, 'Mismatched totals must fail';
  rejected := false;
  begin perform public.ops_record_psss_sale(items,2,1,'Cash','paid'); exception when others then rejected := true; end;
  assert rejected, 'Inconsistent payment status must fail';
  perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
  rejected := false;
  begin perform public.ops_record_psss_sale(items,2,2,'Cash','paid'); exception when others then rejected := true; end;
  assert rejected, 'Missing identity must fail';
end;
$$;
rollback;
select 'PASS: paid, partial, owed, idempotency, input validation, authorization, atomic stock rollback' as result;
