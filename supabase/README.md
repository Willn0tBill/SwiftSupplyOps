# SwiftSupply Ops Supabase backend

Production project: `SwiftSupply` (`phgqgdalmdtvsmqfylnl`).

The live project contains the `ops_*` schema for profiles/roles, customers, SSPW jobs and assignments, subscriptions, vending locations/machines/visits/restock items, PSSS products/sales, money transactions, maintenance, audit logs, and the Google Sheets sync queue.

The deployed Edge Function is `sync-google-sheets` with JWT verification enabled.

Required function secrets before Google Sheets delivery can run:

- `GOOGLE_SHEETS_WEBHOOK_URL` — deployed Apps Script web-app URL.
- `GOOGLE_SHEETS_SHARED_SECRET` — a long random value matching the Apps Script property `SWIFTSUPPLY_SHARED_SECRET`.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to Edge Functions by Supabase.
