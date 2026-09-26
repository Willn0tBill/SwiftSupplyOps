# SwiftSupply Ops

Mobile-first internal operations portal for **SS Vending**, **SwiftSupply Power Washing (SSPW)**, and **Personal Selling for SwiftSupply (PSSS)**.

## What is already built

- Responsive desktop + phone interface with mobile bottom navigation.
- Installable PWA for iPhone/Android home screens.
- Supabase authentication and roles: Owner, Manager, Employee, Viewer.
- Combined business dashboard with cleared money, pending money, upcoming work and all three business lines.
- SSPW customers, leads/jobs, appointments, employee assignment, completion/payment logging, and subscriptions.
- Vending locations, machines, service visits, revenue/expense completion, product catalog and maintenance reports.
- PSSS inventory, bundle-aware quick sales, paid/pending sales and automatic stock reduction.
- Money ledger linked to operational actions.
- Audit and Google Sheets sync queues.
- Supabase Edge Function `sync-google-sheets` deployed with JWT verification.
- Google Apps Script bridge tailored to the current **SwiftSupply Vending Business Manager** workbook tabs/formulas.
- GitHub Pages deployment workflow.

## Live services

Supabase project: `SwiftSupply` (`phgqgdalmdtvsmqfylnl`)

Business spreadsheet: `1niD9R4QDFXxYc6BTbk_MMJGfmcIIsBd_w0x3C6Zwivc`

The database schema is already applied to the connected Supabase project. Current PSSS stock/pricing was seeded from the spreadsheet.

## Google Sheets sync — one-time setup still required

The app/database side is built. Google requires a web-app credential/endpoint before code running outside your Google account can write into your Sheet. This cannot safely be hard-coded in a public repository.

1. Open Google Apps Script and create a project owned by the Google account that can edit the business spreadsheet.
2. Copy `integrations/google-apps-script.gs` into the script project.
3. In **Project Settings → Script properties**, create `SWIFTSUPPLY_SHARED_SECRET` with a long random value.
4. Deploy it as a **Web app**, execute as yourself, and allow the web app to receive requests. Copy its `/exec` URL.
5. In Supabase Edge Function secrets, set `GOOGLE_SHEETS_WEBHOOK_URL` to that `/exec` URL and `GOOGLE_SHEETS_SHARED_SECRET` to the same random value.
6. In SwiftSupply Ops → Settings, press **Sync now**. Pending records will drain into the correct workbook tabs.

The Apps Script uses `[OPS:...]` markers to upsert records instead of blindly duplicating them. Existing workbook formulas in calculated columns are preserved.

## Run locally

```bash
npm install
npm run dev
```

The publishable Supabase key is intentionally safe for browser use; Row Level Security controls access. Never place a Supabase service-role key or the Google Sheets shared secret in browser code or GitHub.

## Deployment

Pushes to `main` run `.github/workflows/pages.yml`. If GitHub Pages has not been enabled for this repository yet, go to **Repository Settings → Pages → Source → GitHub Actions** once, then rerun the workflow.

## First login

Sign in/create the owner account **before sharing the deployed URL**. `ops_ensure_profile()` makes the first SwiftSupply Ops profile the Owner; later accounts default to Employee. The Owner can change staff roles inside the Employees page.
