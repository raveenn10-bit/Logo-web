# LOGOVA — Harsh Apex Digital Solutions

Next.js logo studio and manual WhatsApp payment workflow. Existing site and Supabase project are retained.

## Run locally

Node 20+, `npm install`, `npm run typecheck`, `npm run build`, `npm run dev`.
Copy `.env.example` to `.env.local` and provide the public Supabase URL and publishable key. Never commit the local env file or service role key.

## Credits and payments

Each verified account receives two free completed concepts. `complete_logo_concept` creates the saved vector and decrements one credit in a single database transaction. Errors roll back the entire transaction. Subsequent concepts require one paid credit. The five-concept pack is LKR 300.

`/payments` creates a unique pending order through an authenticated RPC. The WhatsApp button opens a prefilled message for +94 77 066 3154; the customer sends it manually. Receipt upload goes to a private Supabase Storage bucket. A verified administrator checks the bank transaction and approves or rejects the receipt. Approval locks the payment row and adds exactly five credits. A second approval returns false. WhatsApp messages and screenshots never approve payment automatically.

The migration files in `supabase/migrations` version the payment flow, receipt policies, role restrictions and credit backed logo creation. They target the **existing** project schema containing `profiles`, `projects`, `brand_briefs` and `logo_concepts`. These changes are already applied to the connected Supabase project; don't reapply blindly to unrelated projects.

## Admin enrollment

The private admin URL is `/chamilka`. The `app_admins` table remains empty until the owner signs up with `charshan59@gmail.com` and confirms that mailbox. The verified-email database trigger then grants admin access automatically; changing away from that email revokes it. No public admin credentials are hardcoded. Check the actual bank transaction before clicking Approve.

## Deployment

The existing GitHub repository is connected to the existing Vercel project. Production uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The configured `GEMINI_API_KEY` is reserved: this current simple SVG engine does **not** call Gemini. PayHere is not active; payment remains manual via WhatsApp.
