# Debt Tracker

A private, two-user app for monitoring revolving debt across 16+ credit accounts via the Plaid Liabilities API.

**Stack:** Next.js 15 · TypeScript · Tailwind CSS · shadcn/ui · Neon (Postgres) · Drizzle ORM · Plaid Node SDK · Deployed on Vercel

---

## Table of Contents

1. [Local setup](#local-setup)
2. [Getting Plaid credentials](#getting-plaid-credentials)
3. [Deploy to Vercel + Neon](#deploy-to-vercel--neon)
4. [Running the first sync](#running-the-first-sync)
5. [Architecture notes](#architecture-notes)

---

## Local setup

### Prerequisites

- Node.js 20+ (`node --version`)
- A Neon account (free tier is fine)
- A Plaid account (free Sandbox access, or Development for real banks)

### 1. Install dependencies

```bash
cd debt-tracker
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in every value (see comments in the file). Generate the secrets:

```bash
# SESSION_SECRET
openssl rand -base64 32

# ENCRYPTION_KEY
openssl rand -hex 32
```

### 3. Create your Neon database

1. Go to [neon.tech](https://neon.tech) → **New project**
2. Name it `debt-tracker`, pick the region closest to you
3. Copy the **connection string** from the dashboard (it looks like `postgresql://user:pass@ep-xxx.region.aws.neon.tech/neondb?sslmode=require`)
4. Paste it as `DATABASE_URL` in `.env.local`

### 4. Run database migrations

```bash
npm run db:generate   # generates SQL from src/db/schema.ts → drizzle/
npm run db:migrate    # applies migrations to your Neon database
```

Or if you prefer a direct push (no migration files):

```bash
npm run db:push
```

### 5. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You'll be prompted for the passphrase you set in `APP_PASSWORD`.

---

## Getting Plaid credentials

### Sandbox (fake data, no real bank connection)

1. Sign up at [dashboard.plaid.com](https://dashboard.plaid.com) — free, no approval needed
2. Go to **Team Settings → Keys**
3. Copy `client_id` and the **Sandbox** secret
4. Set in `.env.local`:
   ```
   PLAID_CLIENT_ID=your_client_id
   PLAID_SECRET=your_sandbox_secret
   PLAID_ENV=sandbox
   ```
5. In Plaid Link, use these test credentials:
   - Username: `user_good`
   - Password: `pass_good`
   - For credit card institutions, search "Plaid Credit Card"

### Development (real bank connections)

Plaid Development lets you connect real bank accounts at no cost (up to 100 Items).

1. In the Plaid dashboard, go to **Team Settings → Access** → request Development access
2. Approval usually takes 1–2 business days
3. Once approved, copy the **Development** secret and update:
   ```
   PLAID_SECRET=your_development_secret
   PLAID_ENV=development
   ```

Switching from Sandbox → Development only requires changing those two env vars.

---

## Deploy to Vercel + Neon

### 1. Create a Neon database for production

Same steps as local setup — or use the same database you created locally (Neon handles concurrent connections fine).

### 2. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
gh repo create debt-tracker --private --source=. --push
```

### 3. Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) → **New Project** → import your GitHub repo
2. Vercel auto-detects Next.js — accept defaults
3. Under **Environment Variables**, add every variable from `.env.example`:
   - `DATABASE_URL` — your Neon connection string
   - `APP_PASSWORD` — your chosen passphrase
   - `SESSION_SECRET` — `openssl rand -base64 32`
   - `ENCRYPTION_KEY` — `openssl rand -hex 32`
   - `PLAID_CLIENT_ID` — from Plaid dashboard
   - `PLAID_SECRET` — Sandbox or Development secret
   - `PLAID_ENV` — `sandbox` or `development`
   - `NEXT_PUBLIC_APP_URL` — your Vercel URL (e.g. `https://debt-tracker.vercel.app`)
4. Click **Deploy**

### 4. Run migrations on Neon production

After deploy, run migrations locally pointing at the production database:

```bash
DATABASE_URL="<your-neon-production-url>" npm run db:migrate
```

Or add a `postbuild` script in `package.json` to auto-migrate on each deploy:

```json
"postbuild": "drizzle-kit migrate"
```

---

## Running the first sync

1. Open the app and log in with your passphrase
2. Go to **Connect** → click **Connect Institution**
3. Plaid Link opens — search for your bank, log in with online banking credentials
4. After successful connection you're redirected to **Sync**
5. Click **Sync Now** — balances, liabilities, and APRs are pulled and stored
6. Go to **Dashboard** to see your totals, or **Accounts** for the full table

Repeat step 2–5 for each institution (you have 16+ accounts — connect all of them).

**Tip:** If an institution shows "Needs reauth" after a sync, go back to Connect and re-link it. This happens when the bank's session expires or requires MFA re-confirmation.

---

## Architecture notes

### Auth

A single shared passphrase (`APP_PASSWORD`) gates the entire app. Correct passphrase → 30-day signed JWT cookie. Both users see the same data. No accounts, no NextAuth.

### Plaid access token encryption

Each Plaid access token is encrypted with AES-256-GCM before being stored in Postgres. The key lives only in the `ENCRYPTION_KEY` environment variable — it never touches the database. Format stored: `iv:authTag:ciphertext` (hex).

### Sync flow

`POST /api/plaid/sync` iterates over all `plaid_items`, calls `accountsGet` and `liabilitiesGet` for each, then upserts into `accounts`, `liabilities`, and `aprs` tables. If Plaid returns `ITEM_LOGIN_REQUIRED`, the item is flagged `needs_reauth = true` and skipped.

### Manual overrides

The `manual_overrides` table stores fields Plaid doesn't return reliably: promo expiration dates, deferred-interest flags, promo APR percentages, and free-form notes. Edit these on the account detail page — they persist across syncs.

### Database schema

| Table | Purpose |
|---|---|
| `plaid_items` | One row per institution connection (encrypted access token) |
| `accounts` | All Plaid accounts (credit, depository, etc.) |
| `liabilities` | One row per credit account — statement, payment, due date info |
| `aprs` | Multiple rows per account — one per APR type (purchase, BT, promo) |
| `manual_overrides` | User-entered overrides that survive syncs |
| `sync_log` | Audit trail of every sync run |
