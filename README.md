# SwiftSupply Ops

Mobile-first internal operations portal for **SS Vending**, **SwiftSupply Power Washing (SSPW)**, and **Personal Selling for SwiftSupply (PSSS)**.

## What is already built

- Responsive desktop + phone interface with mobile bottom navigation.
- Installable PWA for iPhone/Android home screens.
- Supabase authentication and roles: Owner, Manager, Employee, Viewer.
- New staff accounts stay inactive until an Owner approves them by assigning a role.
- Combined business dashboard with cleared money, pending money, upcoming work and all three business lines.
- SSPW customers, leads/jobs, appointments, employee assignment, completion/payment logging, and subscriptions.
- Vending locations, machines, service visits, revenue/expense completion, product catalog and maintenance reports.
- PSSS inventory, bundle-aware quick sales, paid/pending sales and automatic stock reduction.
- Money ledger linked to operational actions.
- Audit and Google Sheets sync queues.
- Supabase Row Level Security with separate Owner/Manager/Employee/Viewer access.
- Supabase Edge Function `sync-google-sheets` deployed with JWT verification.
- Google Apps Script bridge tailored to the current **SwiftSupply Vending Business Manager** workbook tabs/formulas.
- Automated GitHub Pages deployment.

## Live services

Website: `https://willn0tbill.github.io/SwiftSupplyOps/`

Supabase project: `SwiftSupply` (`phgqgdalmdtvsmqfylnl`)

Business spreadsheet: `1niD9R4QDFXxYc6BTbk_MMJGfmcIIsBd_w0x3C6Zwivc`

The database schema is already applied to the connected Supabase project. Current PSSS stock/pricing was seeded from the spreadsheet.

## Google Sheets sync — one Google-authorized setup remains

The app/database side is built. Google requires an endpoint authorized by the Google account that can edit the business spreadsheet before outside code can write to it.

1. Open Google Apps Script and create a project owned by the Google account that can edit the business spreadsheet.
2. Copy `integrations/google-apps-script.gs` into the script project.
3. In **Project Settings → Script properties**, create `SWIFTSUPPLY_SHARED_SECRET`. Use the same value configured for the Supabase sync bridge.
4. Deploy it as a **Web app**, execute as yourself, and allow the web app to receive requests. Copy its `/exec` URL.
5. Configure the sync bridge with that URL. It supports either Supabase Edge Function secrets (`GOOGLE_SHEETS_WEBHOOK_URL` / `GOOGLE_SHEETS_SHARED_SECRET`) or the private backend settings `google_sheets_webhook_url` / `google_sheets_shared_secret`.
6. In SwiftSupply Ops → Settings, press **Sync now**. Pending records will drain into the correct workbook tabs.

The Apps Script uses `[OPS:...]` markers to upsert records instead of blindly duplicating them. Existing workbook formulas in calculated columns are preserved.

## Run locally

```bash
npm install
npm run dev
```

The publishable Supabase key is intentionally safe for browser use; Row Level Security controls access. Never place a Supabase service-role key or the Google Sheets shared secret in browser code or GitHub.

## Deployment

Pushes to `main` run `.github/workflows/pages.yml` and deploy to GitHub Pages. The workflow has been build-tested and deployed successfully.

## First login

Create/sign in to the Owner account **before sharing the deployed URL**. `ops_ensure_profile()` makes the first active SwiftSupply Ops profile the Owner. Later sign-ups are created as inactive Viewer accounts and cannot read or write business records until the Owner approves them by assigning a staff role in the Employees page.
