-- Keep the existing atomic staff-only sale operation, validate its inputs,
-- and deduplicate retries without allowing staff to edit inventory directly.
alter table public.ops_psss_sales add column request_id uuid unique;
alter table public.ops_psss_sales add column request_payload jsonb;

-- Replace the old signature atomically; the default keeps older clients working.
drop function public.ops_record_psss_sale(jsonb,numeric,numeric,text,text,text,text,text);
create function public.ops_record_psss_sale(
  p_items jsonb, p_total numeric, p_collected numeric,
  p_payment_method text, p_payment_status text, p_account text default 'SS Cash',
  p_buyer_place text default null, p_notes text default null, p_request_id uuid default null
) returns public.ops_psss_sales
language plpgsql security definer set search_path = '' as $$
declare
  s public.ops_psss_sales;
  item jsonb;
  product public.ops_products;
  qty integer;
  price numeric;
  items_total numeric := 0;
  r text;
  payload jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  r := public.ops_current_role();
  if r is null or r not in ('owner','manager','employee','intern') then
    raise exception 'Staff approval required';
  end if;
  payload := jsonb_build_object('items',p_items,'total',p_total,'collected',p_collected,
    'method',p_payment_method,'status',p_payment_status,'account',p_account,
    'buyer',p_buyer_place,'notes',p_notes);
  if p_request_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
    select * into s from public.ops_psss_sales where request_id=p_request_id;
    if found then
      if s.employee_id is distinct from auth.uid() or s.request_payload is distinct from payload then
        raise exception 'This save reference was already used for another sale';
      end if;
      return s;
    end if;
  end if;
  if p_total is null or p_total::text in ('NaN','Infinity','-Infinity') or p_total < 0 or p_total <> round(p_total,2)
    or p_collected is null or p_collected::text in ('NaN','Infinity','-Infinity')
    or p_collected < 0 or p_collected > p_total or p_collected <> round(p_collected,2) then
    raise exception 'Enter valid sale and collected amounts in cents; collected cannot exceed total';
  end if;
  if p_payment_status is null or p_payment_status not in ('paid','pending','partial')
    or (p_payment_status='paid' and p_collected<>p_total)
    or (p_payment_status='pending' and p_collected<>0)
    or (p_payment_status='partial' and (p_collected<=0 or p_collected>=p_total)) then
    raise exception 'Payment status does not match the amount collected';
  end if;
  if p_payment_method is null or p_payment_method not in ('Cash','Apple Cash','Zelle','Card','Other')
    or p_account is null or p_account not in ('SS Cash','SS Bank','Apple Cash','Personal Account','Other') then
    raise exception 'Choose a valid payment method and deposit account';
  end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'Add at least one item to the sale'; end if;
  if jsonb_array_length(p_items)=0 then raise exception 'Add at least one item to the sale'; end if;
  for item in select value from jsonb_array_elements(p_items) loop
    if item->>'product_id' is null or item->>'quantity' is null
      or (item->>'quantity') !~ '^[0-9]+$' or item->>'unit_price' is null then
      raise exception 'Each item needs a product, whole-number quantity, and price';
    end if;
    qty := (item->>'quantity')::integer;
    price := (item->>'unit_price')::numeric;
    if qty<=0 or price::text in ('NaN','Infinity','-Infinity') or price<0 then
      raise exception 'Quantity must be positive and price cannot be negative';
    end if;
    items_total := items_total + qty*round(price,2);
  end loop;
  if items_total<>p_total then raise exception 'Item prices do not add up to the sale total. Refresh the app and try again.'; end if;

  -- Deterministic locks prevent overselling, including duplicate product lines.
  perform p.id from public.ops_products p
    where p.id in (select (value->>'product_id')::uuid from jsonb_array_elements(p_items))
    order by p.id for update;
  for item in select value from jsonb_array_elements(p_items) loop
    select * into product from public.ops_products where id=(item->>'product_id')::uuid;
    if not found or product.business_unit<>'PSSS' or not product.active then
      raise exception 'Product is unavailable for PSSS sales';
    end if;
  end loop;
  insert into public.ops_psss_sales(employee_id,buyer_place,total_amount,collected_amount,
    payment_method,payment_status,account,notes,request_id,request_payload)
  values(auth.uid(),p_buyer_place,p_total,p_collected,p_payment_method,p_payment_status,
    p_account,p_notes,p_request_id,payload) returning * into s;
  for item in select value from jsonb_array_elements(p_items) loop
    qty := (item->>'quantity')::integer;
    update public.ops_products set current_stock=current_stock-qty,updated_at=now()
      where id=(item->>'product_id')::uuid and current_stock>=qty;
    if not found then raise exception 'Insufficient stock. Refresh inventory and adjust the quantity.'; end if;
    insert into public.ops_psss_sale_items(sale_id,product_id,quantity,unit_price)
      values(s.id,(item->>'product_id')::uuid,qty,round((item->>'unit_price')::numeric,2));
  end loop;
  if p_collected>0 then
    insert into public.ops_transactions(account,direction,status,amount,source_category,business_area,source_type,source_id,notes,recorded_by)
    values(p_account,'In','Cleared',p_collected,'Personal Sale','Personal Selling','psss_sale',s.id,s.sale_code,auth.uid());
  end if;
  if p_total>p_collected then
    insert into public.ops_transactions(account,direction,status,amount,source_category,business_area,source_type,source_id,notes,recorded_by)
    values('Other','In','Pending',p_total-p_collected,'Personal Sale Owed','Personal Selling','psss_sale',s.id,s.sale_code,auth.uid());
  end if;
  return s;
end;
$$;
revoke all on function public.ops_record_psss_sale(jsonb,numeric,numeric,text,text,text,text,text,uuid) from public,anon;
grant execute on function public.ops_record_psss_sale(jsonb,numeric,numeric,text,text,text,text,text,uuid) to authenticated;
notify pgrst, 'reload schema';
