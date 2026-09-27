import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  async function privateSetting(key: string) {
    const { data } = await db.from("ops_private_settings").select("value").eq("key", key).maybeSingle();
    return data?.value || null;
  }

  const webhookUrl = Deno.env.get("GOOGLE_SHEETS_WEBHOOK_URL") || await privateSetting("google_sheets_webhook_url");
  const sharedSecret = Deno.env.get("GOOGLE_SHEETS_SHARED_SECRET") || await privateSetting("google_sheets_shared_secret");

  if (!webhookUrl || !sharedSecret) {
    return json({ ok: false, configured: false, message: "Google Sheets webhook is not configured yet." }, 503);
  }

  const { data: queue, error } = await db
    .from("ops_sync_queue")
    .select("*")
    .in("status", ["pending", "failed"])
    .lt("attempts", 5)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) return json({ ok: false, error: error.message }, 500);
  if (!queue?.length) return json({ ok: true, configured: true, synced: 0 });

  const events = [];
  for (const q of queue) {
    await db.from("ops_sync_queue").update({ status: "syncing", attempts: q.attempts + 1 }).eq("id", q.id);
    events.push(await enrich(db, q));
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: sharedSecret, events }),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Sheets webhook ${response.status}: ${text.slice(0, 500)}`);

    let bridge: any;
    try {
      bridge = JSON.parse(text);
    } catch {
      throw new Error(`Sheets bridge returned a non-JSON response: ${text.slice(0, 500)}`);
    }

    if (bridge?.ok !== true) {
      throw new Error(`Sheets bridge rejected the batch: ${bridge?.error || bridge?.message || text.slice(0, 500)}`);
    }

    if (Number(bridge?.processed ?? -1) !== events.length) {
      throw new Error(`Sheets bridge acknowledged ${Number(bridge?.processed ?? 0)} of ${events.length} event(s).`);
    }

    const ids = queue.map((q) => q.id);
    await db.from("ops_sync_queue").update({ status: "synced", synced_at: new Date().toISOString(), last_error: null }).in("id", ids);
    return json({ ok: true, configured: true, synced: ids.length, bridge });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const ids = queue.map((q) => q.id);
    await db.from("ops_sync_queue").update({ status: "failed", last_error: message }).in("id", ids);
    return json({ ok: false, configured: true, synced: 0, error: message }, 502);
  }
});

async function enrich(db: any, q: any) {
  const base: any = { queue_id: q.id, entity_table: q.entity_table, operation: q.operation, data: q.payload, related: {} };
  const d = q.payload || {};

  if (q.entity_table === "ops_jobs") {
    if (d.customer_id) {
      const { data } = await db.from("ops_customers").select("*").eq("id", d.customer_id).maybeSingle();
      base.related.customer = data;
    }
    const { data: assigns } = await db.from("ops_job_assignments").select("employee_id").eq("job_id", d.id);
    const ids = (assigns || []).map((x: any) => x.employee_id);
    if (ids.length) {
      const { data } = await db.from("ops_profiles").select("id,full_name,role").in("id", ids);
      base.related.assignees = data || [];
    }
  }

  if (q.entity_table === "ops_subscriptions" && d.customer_id) {
    const { data } = await db.from("ops_customers").select("*").eq("id", d.customer_id).maybeSingle();
    base.related.customer = data;
  }

  if (q.entity_table === "ops_vending_visits") {
    const { data: machine } = await db.from("ops_vending_machines").select("*").eq("id", d.machine_id).maybeSingle();
    base.related.machine = machine;
    if (machine?.location_id) {
      const { data: location } = await db.from("ops_vending_locations").select("*").eq("id", machine.location_id).maybeSingle();
      base.related.location = location;
    }
    const { data: items } = await db.from("ops_vending_restock_items").select("*").eq("visit_id", d.id);
    base.related.restock_items = items || [];
    const productIds = [...new Set((items || []).map((x: any) => x.product_id))];
    if (productIds.length) {
      const { data: products } = await db.from("ops_products").select("*").in("id", productIds);
      base.related.products = products || [];
    }
    if (d.employee_id) {
      const { data: employee } = await db.from("ops_profiles").select("id,full_name").eq("id", d.employee_id).maybeSingle();
      base.related.employee = employee;
    }
  }

  if (q.entity_table === "ops_vending_restock_items") {
    const { data: product } = await db.from("ops_products").select("*").eq("id", d.product_id).maybeSingle();
    const { data: visit } = await db.from("ops_vending_visits").select("*").eq("id", d.visit_id).maybeSingle();
    base.related.product = product;
    base.related.visit = visit;
  }

  if (q.entity_table === "ops_psss_sales") {
    const { data: items } = await db.from("ops_psss_sale_items").select("*").eq("sale_id", d.id);
    const productIds = [...new Set((items || []).map((x: any) => x.product_id))];
    let products: any[] = [];
    if (productIds.length) {
      const res = await db.from("ops_products").select("*").in("id", productIds);
      products = res.data || [];
    }
    base.related.items = (items || []).map((i: any) => ({ ...i, product: products.find((p: any) => p.id === i.product_id) || null }));
  }

  if (q.entity_table === "ops_maintenance") {
    const { data: machine } = await db.from("ops_vending_machines").select("*").eq("id", d.machine_id).maybeSingle();
    base.related.machine = machine;
  }

  return base;
}
