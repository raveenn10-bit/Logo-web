import {test, before} from "node:test";
import assert from "node:assert/strict";
import {readFileSync, readdirSync} from "node:fs";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
import {PGlite} from "@electric-sql/pglite";

const db = new PGlite();
const SECRET = "test-server-secret";
const root = join(__dirname, "..");
const brief = (brand = "Northline") => JSON.stringify({brand, style: "minimalist", industry: "Technology", colors: [], details: "", tagline: "", refine: ""});
const hash = (n: number) => n.toString(16).padStart(64, "0");

async function user(email: string | null, anonymous = false) {
  const r = await db.query<{id: string}>("insert into auth.users(email,email_confirmed_at,is_anonymous,raw_app_meta_data) values($1,$2,$3,$4) returning id",
    [email, email ? new Date().toISOString() : null, anonymous, JSON.stringify({provider: anonymous ? "anonymous" : "google"})]);
  return r.rows[0].id;
}
/** Run a statement as the `authenticated` role with Supabase-style JWT claims. */
async function as<T>(uid: string, anonymous: boolean, sql: string, params: unknown[] = []) {
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({sub: uid, role: "authenticated", is_anonymous: anonymous})]);
  await db.exec("set role authenticated");
  try { return (await db.query<T>(sql, params)).rows; }
  finally { await db.exec("reset role"); await db.query("select set_config('request.jwt.claims','',false)"); }
}
async function generate(uid: string, anonymous: boolean, client: string | null = hash(1)) {
  const [{begin_ai_logo_v2: start}] = await as<{begin_ai_logo_v2: Record<string, unknown>}>(uid, anonymous, "select public.begin_ai_logo_v2($1,$2::jsonb,$3,$4)", [randomUUID(), brief(), SECRET, client]);
  if (start.status !== "new") return start;
  const [{finish_ai_logo_v2: done}] = await as<{finish_ai_logo_v2: Record<string, unknown>}>(uid, anonymous, "select public.finish_ai_logo_v2($1,$2::jsonb,$3,$4,$5,$6)",
    [start.job_id, JSON.stringify({name: "Minimalist direction"}), "<svg></svg>", "gemini-test", 10, SECRET]);
  return done;
}

before(async () => {
  await db.exec(readFileSync(join(root, "tests/db/supabase-stub.sql"), "utf8"));
  // Production applied manual_payments before atomic_logo_credits (the latter depends on it).
  const files = readdirSync(join(root, "supabase/migrations")).sort((a, b) => a.includes("manual_payments") && b.includes("atomic_logo_credits") ? -1 : b.includes("manual_payments") && a.includes("atomic_logo_credits") ? 1 : a.localeCompare(b));
  for (const file of files) await db.exec(readFileSync(join(root, "supabase/migrations", file), "utf8"));
  // The v2 migration is designed to be re-runnable.
  await db.exec(readFileSync(join(root, "supabase/migrations/20261111_logova_v2_entitlements_admin.sql"), "utf8"));
  await db.query("insert into logova_private.server_config(name,value) values('ai_secret_hash',encode(sha256(convert_to($1,'UTF8')),'hex'))", [SECRET]);
});

test("guest gets exactly one free logo; a refresh (same session) cannot reset it", async () => {
  const guest = await user(null, true);
  assert.equal((await generate(guest, true, hash(10))).source, "free");
  assert.deepEqual(await generate(guest, true, hash(10)), {login_required: true});
});

test("new anonymous sessions from the same network are capped (storage-clearing bypass)", async () => {
  const results = [];
  for (let i = 0; i < 4; i++) results.push(await generate(await user(null, true), true, hash(20)));
  assert.deepEqual(results.map(r => r.source ?? r.reason), ["free", "free", "free", "network_limit"]);
  assert.equal((await generate(await user(null, true), true, null)).login_required, true, "guests without a network hash are refused");
});

test("guest who links Google keeps the same id and receives one more free logo (two total)", async () => {
  const id = await user(null, true);
  assert.equal((await generate(id, true, hash(30))).source, "free");
  await db.query("update auth.users set is_anonymous=false,email='linked@example.com' where id=$1", [id]);
  assert.equal((await generate(id, false)).source, "free");
  assert.deepEqual(await generate(id, false), {payment_required: true});
  const [{free_used}] = (await db.query<{free_used: number}>("select free_used from public.user_credits where user_id=$1", [id])).rows;
  assert.equal(free_used, 2);
});

test("server secret is required to start or finish a generation", async () => {
  const id = await user("nosecret@example.com");
  await assert.rejects(as(id, false, "select public.begin_ai_logo_v2($1,$2::jsonb,$3,null)", [randomUUID(), brief(), "wrong"]), /forbidden/);
});

test("same request id is idempotent and never double-charges", async () => {
  const id = await user("idem@example.com");
  const req = randomUUID();
  const [{begin_ai_logo_v2: a}] = await as<{begin_ai_logo_v2: {job_id: string}}>(id, false, "select public.begin_ai_logo_v2($1,$2::jsonb,$3,null)", [req, brief(), SECRET]);
  await as(id, false, "select public.finish_ai_logo_v2($1,'{\"name\":\"x\"}'::jsonb,'<svg/>','m',1,$2)", [a.job_id, SECRET]);
  await as(id, false, "select public.finish_ai_logo_v2($1,'{\"name\":\"x\"}'::jsonb,'<svg/>','m',1,$2)", [a.job_id, SECRET]);
  const [{begin_ai_logo_v2: again}] = await as<{begin_ai_logo_v2: {status: string}}>(id, false, "select public.begin_ai_logo_v2($1,$2::jsonb,$3,null)", [req, brief(), SECRET]);
  assert.equal(again.status, "completed");
  const [{free_used}] = (await db.query<{free_used: number}>("select free_used from public.user_credits where user_id=$1", [id])).rows;
  assert.equal(free_used, 1);
});

test("guests cannot create payment orders; registered users reuse one open reference", async () => {
  const guest = await user(null, true);
  await assert.rejects(as(guest, true, "select * from public.create_logo_payment_request()"), /Sign in with Google/);
  const id = await user("buyer@example.com");
  const [a] = await as<{order_id: string}>(id, false, "select * from public.create_logo_payment_request()");
  const [b] = await as<{order_id: string}>(id, false, "select * from public.create_logo_payment_request()");
  assert.equal(a.order_id, b.order_id);
  assert.match(a.order_id, /^LOG-[0-9A-F]{12}$/);
});

test("payment approval: receipt required, admin only, credits once, duplicate approval refused", async () => {
  const admin = await user("charshan59@gmail.com");
  const buyer = await user("pay@example.com");
  assert.equal((await db.query("select 1 from public.app_admins where user_id=$1", [admin])).rows.length, 1, "verified admin email is enrolled by trigger");
  const [order] = await as<{id: string}>(buyer, false, "select * from public.create_logo_payment_request()");
  await assert.rejects(as(admin, false, "select public.review_logo_payment($1,true,null)", [order.id]), /receipt required/);
  const path = `${buyer}/${order.id}/r.png`;
  await db.query("insert into storage.objects(bucket_id,name) values('payment-receipts',$1)", [path]);
  assert.deepEqual(await as(buyer, false, "select public.submit_payment_receipt($1,$2) ok", [order.id, path]), [{ok: true}]);
  await assert.rejects(as(buyer, false, "select public.review_logo_payment($1,true,null)", [order.id]), /forbidden/, "customer cannot self-approve");
  assert.deepEqual(await as(admin, false, "select public.review_logo_payment($1,true,null) ok", [order.id]), [{ok: true}]);
  assert.deepEqual(await as(admin, false, "select public.review_logo_payment($1,true,null) ok", [order.id]), [{ok: false}]);
  const [{paid_credits}] = (await db.query<{paid_credits: number}>("select paid_credits from public.user_credits where user_id=$1", [buyer])).rows;
  assert.equal(paid_credits, 5, "default pack is five credits");
  const [{credits_granted}] = (await db.query<{credits_granted: number}>("select credits_granted from public.payment_requests where id=$1", [order.id])).rows;
  assert.equal(credits_granted, 5);
  // Paid credits are consumed after free ones.
  assert.equal((await generate(buyer, false)).source, "free");
  assert.equal((await generate(buyer, false)).source, "free");
  assert.equal((await generate(buyer, false)).source, "paid");
});

test("admin RPCs are refused for ordinary users and work for admins", async () => {
  const admin = (await db.query<{user_id: string}>("select user_id from public.app_admins limit 1")).rows[0].user_id;
  const normal = await user("normal@example.com");
  for (const sql of ["select public.logo_admin_overview()", "select * from public.logo_admin_users(null,10)", "select * from public.logo_admin_generations(null,10)",
    "select * from public.logo_admin_audit(10)", "select * from public.logo_admin_daily(7)", "select public.logo_admin_get_settings()", "select * from public.logo_admin_payments(null,null,10)"]) {
    await assert.rejects(as(normal, false, sql), /forbidden/, sql);
    await as(admin, false, sql);
  }
  await assert.rejects(as(normal, false, "select public.logo_admin_adjust_credits($1,5,'gift for testing')", [normal]), /forbidden/);
  await db.exec("set role anon");
  try { await assert.rejects(db.query("select public.logo_admin_overview()"), /permission denied/); }
  finally { await db.exec("reset role"); }
});

test("admin credit adjustments are bounded, reasoned and audited", async () => {
  const admin = (await db.query<{user_id: string}>("select user_id from public.app_admins limit 1")).rows[0].user_id;
  const target = await user("adjust@example.com");
  await assert.rejects(as(admin, false, "select public.logo_admin_adjust_credits($1,5,'no')", [target]), /reason required/);
  await assert.rejects(as(admin, false, "select public.logo_admin_adjust_credits($1,-1,'remove a credit')", [target]), /below zero/);
  const [{logo_admin_adjust_credits: r}] = await as<{logo_admin_adjust_credits: {paid_credits: number}}>(admin, false, "select public.logo_admin_adjust_credits($1,3,'goodwill credit')", [target]);
  assert.equal(r.paid_credits, 3);
  const audit = await as<{action: string; category: string}>(admin, false, "select * from public.logo_admin_audit(50)");
  assert.ok(audit.some(a => a.action === "credits_adjusted" && a.category === "credits"));
  assert.ok(audit.some(a => a.action === "approved_credits" && a.category === "payment"));
});

test("settings: admin can change pack size and pause generation; changes are audited", async () => {
  const admin = (await db.query<{user_id: string}>("select user_id from public.app_admins limit 1")).rows[0].user_id;
  await as(admin, false, "select public.logo_admin_update_settings($1::jsonb)", [JSON.stringify({generation_enabled: false, announcement: "Back at 6pm"})]);
  const someone = await user("paused@example.com");
  const [{begin_ai_logo_v2: r}] = await as<{begin_ai_logo_v2: {disabled: boolean; message: string}}>(someone, false, "select public.begin_ai_logo_v2($1,$2::jsonb,$3,null)", [randomUUID(), brief(), SECRET]);
  assert.deepEqual(r, {disabled: true, message: "Back at 6pm"});
  await assert.rejects(as(admin, false, "select public.logo_admin_update_settings('{\"credits_per_payment\":0}'::jsonb)"), /check constraint/);
  await as(admin, false, "select public.logo_admin_update_settings('{\"generation_enabled\":true,\"announcement\":\"\"}'::jsonb)");
  const [{logova_public_settings: pub}] = await as<{logova_public_settings: {generation_enabled: boolean; announcement: null; credits_per_payment: number}}>(someone, false, "select public.logova_public_settings()");
  assert.equal(pub.generation_enabled, true); assert.equal(pub.announcement, null); assert.equal(pub.credits_per_payment, 5);
  const [{logova_my_entitlements: mine}] = await as<{logova_my_entitlements: {free_remaining: number; is_guest: boolean}}>(someone, false, "select public.logova_my_entitlements()");
  assert.deepEqual([mine.free_remaining, mine.is_guest], [2, false]);
});

test("legacy v1 RPCs remain callable by the server for backward-compatible deploys", async () => {
  const id = await user("legacy@example.com");
  const [{begin_ai_logo: r}] = await as<{begin_ai_logo: {status: string}}>(id, false, "select public.begin_ai_logo($1,$2::jsonb,$3)", [randomUUID(), brief(), SECRET]);
  assert.equal(r.status, "new");
});
