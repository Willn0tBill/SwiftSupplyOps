# PSSS sale saving

The old sale form called `prompt()` while rendering Partial payments. In the
embedded browser this threw `prompt() is not supported` and crashed the app;
in other browsers every redraw could reopen the prompt. It also required an
unexplained Add item step before enabling Save and had no negotiated total.

SaleForm now uses a normal amount-collected input, explains the cart step,
checks whole quantities and available stock, supports a custom total, and
shows collected/owed amounts and the deposit account before submitting.
Promotional and negotiated prices are allocated in whole cents. If needed,
one product uses two adjacent unit prices so the generated database line
totals sum exactly to the sale total.

The RPC remains one atomic operation for the sale, items, stock and ledger.
It rejects empty carts, invalid products/quantities, inconsistent totals or
payment status, and insufficient stock. Products are locked in ID order.
An optional request UUID deduplicates retries and rejects changed payloads
using the same UUID. The form retains its UUID after a failed request.

The existing SECURITY DEFINER operation is intentional: approved staff can
record sales without gaining general inventory-update permission. It checks
the active staff role from the database, uses an empty search_path and fully
qualified relations, and is executable by authenticated users only. RLS
policies are unchanged. Supabase's authenticated-definer advisory is expected
for this narrowly authorized RPC; public/anonymous execution is revoked.

Validation:
- `npm test` covers negotiated totals, odd promotional quantities and invalid carts.
- `npm run build` builds the production site.
- `supabase/tests/psss_sale.sql` tests paid/partial/owed ledger entries,
  retry deduplication, validation, missing identity, and rollback after a later
  item fails. Run via a privileged SQL test connection; all fixtures roll back.
- Verify the deployed form using an authorized real sale, then reconcile its
  item quantities, generated totals, remaining stock and linked ledger entry.

Google Sheets sync is queued by the existing transaction triggers and launched
after the RPC succeeds. A sync failure must not cause the sale to be recorded again.
