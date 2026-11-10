# LOGOVA — Harsh Apex Digital Solutions

Next.js AI logo builder with Gemini generation, an editable vector studio, a manual WhatsApp payment workflow and an admin control centre. The existing Supabase project and its data are retained.

## Run locally

Node 20+, then:

```bash
npm install
npm run typecheck   # TypeScript
npm test            # unit + database tests (no external services needed)
npm run build
npm run dev
```

Copy `.env.example` to `.env.local`. Never commit the local env file or any service key.

| Variable | Used by | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser + API route | public values |
| `AI_SERVER_SECRET` | `/api/generate` | its SHA-256 must be stored in `logova_private.server_config` (`ai_secret_hash`) |
| `GEMINI_API_KEY`, `GEMINI_MODEL` (optional) | `/api/generate` | server-only |
| `NEXT_PUBLIC_SITE_URL` (optional) | OAuth callback | defaults to `https://logo.harshapex.com.lk` |
| `GOOGLE_SITE_VERIFICATION` (optional) | metadata | |

## Logo generation

`/studio` collects business name, tagline, industry, one of ten styles (Minimalist, Luxury, Modern, Typography, Monogram, Abstract, Geometric, Mascot, 3D-inspired, Emblem), brand colours and notes. `/api/generate`:

1. reserves a job in the database (`begin_ai_logo_v2`), which enforces every limit server-side;
2. asks Gemini for a structured vector spec with a ~24 s budget and one retry on transient errors (408/429/5xx);
3. falls back to the deterministic LOGOVA vector engine (`lib/vector-engine.ts`) if Gemini is slow, unavailable or returns an invalid design;
4. renders sanitised SVG with live brand-name/tagline text and saves it while consuming exactly one credit (`finish_ai_logo_v2`).

Requests carry a client-generated id, so retries and "still processing" polling never charge twice. Failed generations never use a credit.

## Free usage and credits

- **Guest:** 1 free logo without sign-in (Supabase anonymous session). Also capped per salted network hash (default 3/day), so clearing browser storage can't mint unlimited free logos.
- **Google account:** 2 free logos in total. Linking Google to the guest session keeps the same user id, so the guest logo counts toward the 2.
- **Paid:** each approved LKR 300 payment adds a credit pack (default **5**, configurable in admin Settings).

All checks run in Postgres functions. Refreshing the page or calling the API directly cannot bypass them.

## Payments (manual, WhatsApp +94 77 066 3154)

The paywall creates (or reuses) a unique `LOG-…` reference via `create_logo_payment_request` (registered accounts only) and opens a prefilled WhatsApp message. The customer uploads a receipt to the private `payment-receipts` bucket from `/payments`. An administrator verifies the bank transaction and approves it. `review_logo_payment` locks the row, requires a receipt, and grants credits once; a second approval returns `false`. Nothing is ever approved automatically.

## Admin (`/chamilka`)

Overview with 14-day activity, payment review, user search with audited credit adjustments, generation monitoring with previews, a unified audit log, and settings (pack size, free limits, guest network cap, generation on/off, announcement banner). Access is enforced by the database (`app_admins` + `is_logo_admin()` inside every security-definer RPC); the page itself holds no privileges. Admin enrollment is automatic for the verified owner email via the `on_logova_admin_verified` trigger.

## Database migrations

`supabase/migrations` targets the **existing** project schema (`profiles`, `projects`, `brand_briefs`, `logo_concepts`, `generation_jobs`, …). Files up to `20261110_*` are already applied in production.

**`20261111_logova_v2_entitlements_admin.sql` is new and must be applied before or right after deploying this version.** It is additive and idempotent: it only adds tables, nullable columns and functions, and replaces three functions with compatible signatures (`create_logo_payment_request`, `review_logo_payment`, `logo_admin_overview`). It drops nothing and changes no existing rows. Until it is applied, the API automatically falls back to the previous v1 functions (generation keeps working, but the new guest limits and admin sections are inactive).

Apply via the Supabase SQL editor or `supabase db push`. Note: `20261106_manual_payments.sql` must run before `20261106_atomic_logo_credits.sql` (as in production).

## Tests

- `tests/logo.test.ts`: brief validation, SVG escaping, text fitting, all 10 styles, and the Gemini client (mocked) covering retry, timeout and fallback.
- `tests/db.test.ts`: runs every migration on PGlite (embedded Postgres) with a Supabase stub. Covers guest/network limits, Google linking, idempotency, payments, admin authorisation, credit adjustments, settings and v1 compatibility.
- `tests/e2e/*.e2e.js`: Playwright flows against `next start` and `tests/e2e/mock-supabase.ts`, a PGlite-backed mock of the Supabase HTTP API:

```bash
AI_SERVER_SECRET=test-server-secret npx tsx tests/e2e/mock-supabase.ts 54321 &
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=test npm run build
AI_SERVER_SECRET=test-server-secret GEMINI_API_KEY=fake npx next start -p 3100 &
node tests/e2e/studio.e2e.js && node tests/e2e/admin.e2e.js && node tests/e2e/home.e2e.js
```

## Deployment

The GitHub repository is connected to the existing Vercel project. Recommended order:

1. Review the pull request and its Vercel preview.
2. Apply `20261111_logova_v2_entitlements_admin.sql` to Supabase.
3. In Supabase Auth → URL configuration, make sure `https://logo.harshapex.com.lk/auth/callback` is allowed (add the preview URL pattern too, to test Google sign-in on previews).
4. Merge to the production branch. Vercel deploys automatically.
5. Smoke test: guest logo → Google sign-in → second logo → paywall → reference → receipt → admin approve.
