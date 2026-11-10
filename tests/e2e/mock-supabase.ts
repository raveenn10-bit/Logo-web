/**
 * Local stand-in for the Supabase HTTP APIs used by LOGOVA (auth, PostgREST RPC and
 * simple selects, storage), backed by PGlite running the real migrations. Test-only.
 * Usage: tsx tests/e2e/mock-supabase.ts [port]
 */
import {createServer, type IncomingMessage, type ServerResponse} from "node:http";
import {readFileSync, readdirSync} from "node:fs";
import {join} from "node:path";
import {PGlite} from "@electric-sql/pglite";

const port = Number(process.argv[2] || 54321);
const root = join(__dirname, "..", "..");
const db = new PGlite();
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
type U = {id: string; email: string | null; is_anonymous: boolean};

function token(u: U) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return `${b64({alg: "HS256", typ: "JWT"})}.${b64({sub: u.id, role: "authenticated", email: u.email, is_anonymous: u.is_anonymous, exp, aud: "authenticated"})}.sig`;
}
function userJson(u: U) {
  return {id: u.id, aud: "authenticated", role: "authenticated", email: u.email || "", is_anonymous: u.is_anonymous, app_metadata: {provider: u.is_anonymous ? "anonymous" : "email"}, user_metadata: {}, identities: [], created_at: new Date().toISOString()};
}
function session(u: U) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return {access_token: token(u), token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: "r-" + u.id, user: userJson(u)};
}
function claims(req: IncomingMessage): Record<string, unknown> | null {
  const h = req.headers.authorization || "";
  const parts = h.replace(/^Bearer /, "").split(".");
  if (parts.length !== 3) return null;
  try { const c = JSON.parse(Buffer.from(parts[1], "base64url").toString()); return c.sub ? c : null; } catch { return null; }
}
async function body(req: IncomingMessage) { const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer); const raw = Buffer.concat(chunks); return raw; }
function send(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, {"content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-expose-headers": "*"});
  res.end(data === undefined ? "" : JSON.stringify(data));
}
async function asRole<T>(c: Record<string, unknown> | null, sql: string, params: unknown[]) {
  await db.query("select set_config('request.jwt.claims',$1,false)", [c ? JSON.stringify(c) : ""]);
  await db.exec(c ? "set role authenticated" : "set role anon");
  try { return await db.query<T>(sql, params); } finally { await db.exec("reset role"); await db.query("select set_config('request.jwt.claims','',false)"); }
}
let queue = Promise.resolve();
const serial = <T>(fn: () => Promise<T>) => { const p = queue.then(fn, fn); queue = p.then(() => undefined, () => undefined); return p; };

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || "/", "http://x");
  if (req.method === "OPTIONS") return send(res, 204, undefined);
  const raw = await body(req);
  const json = () => { try { return raw.length ? JSON.parse(raw.toString()) : {}; } catch { return {}; } };
  const c = claims(req);
  // ---- auth ----
  if (url.pathname === "/auth/v1/signup") {
    const b = json();
    const anon = !b.email;
    const r = await db.query<U>("insert into auth.users(email,is_anonymous,email_confirmed_at,raw_app_meta_data) values($1,$2,$3,$4) returning id,email,is_anonymous", [b.email || null, anon, b.email ? new Date().toISOString() : null, JSON.stringify({provider: anon ? "anonymous" : "email"})]);
    return send(res, 200, session(r.rows[0]));
  }
  if (url.pathname === "/auth/v1/token") {
    const b = json();
    if (url.searchParams.get("grant_type") === "refresh_token") {
      const r = await db.query<U>("select id,email,is_anonymous from auth.users where id=$1", [String(b.refresh_token).slice(2)]);
      return r.rows[0] ? send(res, 200, session(r.rows[0])) : send(res, 400, {error: "invalid_grant", error_description: "Invalid Refresh Token"});
    }
    let r = await db.query<U>("select id,email,is_anonymous from auth.users where lower(email)=lower($1)", [b.email]);
    if (!r.rows[0]) r = await db.query<U>("insert into auth.users(email,email_confirmed_at,raw_app_meta_data) values($1,now(),'{\"provider\":\"email\"}') returning id,email,is_anonymous", [b.email]);
    return send(res, 200, session(r.rows[0]));
  }
  if (url.pathname === "/auth/v1/user") {
    if (!c) return send(res, 401, {msg: "invalid JWT"});
    const r = await db.query<U>("select id,email,is_anonymous from auth.users where id=$1", [c.sub]);
    return r.rows[0] ? send(res, 200, userJson(r.rows[0])) : send(res, 401, {msg: "user not found"});
  }
  if (url.pathname === "/auth/v1/logout") return send(res, 204, undefined);
  // ---- PostgREST RPC ----
  const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/);
  if (rpc) {
    const args = json() as Record<string, unknown>;
    const keys = Object.keys(args);
    const meta = await db.query<{rt: string; retset: boolean}>("select format_type(prorettype,null) rt, proretset retset from pg_proc where proname=$1 and pronamespace='public'::regnamespace limit 1", [rpc[1]]);
    if (!meta.rows[0]) return send(res, 404, {code: "PGRST202", message: "Could not find the function public." + rpc[1]});
    const call = `public.${rpc[1]}(${keys.map((k, i) => `${k} => $${i + 1}`).join(",")})`;
    const values = keys.map(k => typeof args[k] === "object" && args[k] !== null ? JSON.stringify(args[k]) : args[k]);
    try {
      const composite = meta.rows[0].retset || /^(record|payment_requests|logo_versions)$/.test(meta.rows[0].rt);
      const r = await asRole<Record<string, unknown>>(c, composite ? `select * from ${call}` : `select ${call} as v`, values);
      if (meta.rows[0].retset) return send(res, 200, r.rows);
      return send(res, 200, composite ? r.rows[0] : r.rows[0]?.v ?? null);
    } catch (e) { return send(res, 400, {code: (e as {code?: string}).code || "P0001", message: (e as Error).message}); }
  }
  // ---- PostgREST table reads (subset) ----
  const table = url.pathname.match(/^\/rest\/v1\/(\w+)$/);
  if (table && req.method === "GET") {
    const filters: string[] = []; const params: unknown[] = [];
    url.searchParams.forEach((v, k) => { const m = v.match(/^eq\.(.*)$/); if (m && /^\w+$/.test(k)) { params.push(m[1]); filters.push(`t.${k}::text=$${params.length}`); } });
    const where = filters.length ? " where " + filters.join(" and ") : "";
    const limit = Number(url.searchParams.get("limit") || 100);
    let rows: unknown[];
    if (table[1] === "projects") {
      rows = (await db.query(`select t.*,coalesce((select json_agg(l) from public.logo_concepts l where l.project_id=t.id),'[]') logo_concepts from public.projects t${where} order by t.created_at desc limit ${limit}`, params)).rows;
    } else rows = (await db.query(`select t.* from public.${table[1]} t${where} limit ${limit}`, params)).rows;
    if ((req.headers.accept || "").includes("vnd.pgrst.object")) return rows[0] ? send(res, 200, rows[0]) : send(res, 406, {code: "PGRST116", message: "no rows"});
    return send(res, 200, rows);
  }
  // ---- storage ----
  const up = url.pathname.match(/^\/storage\/v1\/object\/([\w-]+)\/(.+)$/);
  if (up && req.method === "POST") { await db.query("insert into storage.objects(bucket_id,name) values($1,$2)", [up[1], decodeURIComponent(up[2])]); return send(res, 200, {Key: up[1] + "/" + up[2], Id: "x"}); }
  const sign = url.pathname.match(/^\/storage\/v1\/object\/sign\/([\w-]+)\/(.+)$/);
  if (sign) return send(res, 200, {signedURL: "/storage/v1/object/public/receipt.png"});
  return send(res, 404, {message: "mock: not implemented " + req.method + " " + url.pathname});
}

(async () => {
  await db.exec(readFileSync(join(root, "tests/db/supabase-stub.sql"), "utf8"));
  const files = readdirSync(join(root, "supabase/migrations")).sort((a, b) => a.includes("manual_payments") && b.includes("atomic_logo_credits") ? -1 : b.includes("manual_payments") && a.includes("atomic_logo_credits") ? 1 : a.localeCompare(b));
  for (const f of files) await db.exec(readFileSync(join(root, "supabase/migrations", f), "utf8"));
  await db.query("insert into logova_private.server_config(name,value) values('ai_secret_hash',encode(sha256(convert_to($1,'UTF8')),'hex'))", [process.env.AI_SERVER_SECRET || "test-server-secret"]);
  createServer((req, res) => { serial(() => handle(req, res)).catch(e => { console.error(e); send(res, 500, {message: String(e)}); }); }).listen(port, () => console.log("mock supabase on " + port));
})();
