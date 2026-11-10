import {createHash} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {generateConcept,parseBrief,ProviderError} from "../../../lib/gemini";
import {renderLogo} from "../../../lib/logo";

export const runtime = "nodejs";
export const maxDuration = 60;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Salted hash of the caller's network address: lets the database cap guest trials without storing IPs. */
function clientHash(request: Request, secret: string) {
  const ip = request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return createHash("sha256").update(secret + "|guest|" + ip).digest("hex");
}
const missingFunction = (e: {code?: string; message?: string} | null) => !!e && (e.code === "PGRST202" || /could not find the function/i.test(e.message || ""));

export async function POST(request: Request) {
  const token = request.headers.get("authorization");
  if (!token?.startsWith("Bearer ")) return Response.json({error:"Sign in to create a logo."},{status:401});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,secret=process.env.AI_SERVER_SECRET;
  if (!url || !key || !secret || !process.env.GEMINI_API_KEY) return Response.json({error:"AI generation is not configured. No credit was used."},{status:503});
  if (Number(request.headers.get("content-length")||0)>8000) return Response.json({error:"Brief is too large."},{status:413});
  const db=createClient(url,key,{global:{headers:{Authorization:token}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:authError}=await db.auth.getUser(token.slice(7));
  if (authError || !user) return Response.json({error:"Your session expired. Please sign in again."},{status:401});
  let brief,requestId:string;
  try {
    const raw=await request.text();
    if (raw.length>8000) throw new Error("Brief is too large.");
    const body=JSON.parse(raw); brief=parseBrief(body);
    requestId=body.requestId;
    if (typeof requestId!=="string" || !uuid.test(requestId)) throw new Error("Invalid generation request.");
  } catch(e) { return Response.json({error:e instanceof Error?e.message:"Invalid request."},{status:400}); }

  // v2 enforces guest/network limits and admin settings; v1 keeps generation working until the migration is applied.
  let v2=true;
  let start=await db.rpc("begin_ai_logo_v2",{p_request:requestId,p_brief:brief,p_secret:secret,p_client:clientHash(request,secret)});
  if (missingFunction(start.error)) { v2=false; console.warn("begin_ai_logo_v2 missing; apply supabase/migrations/20261111_logova_v2_entitlements_admin.sql"); start=await db.rpc("begin_ai_logo",{p_request:requestId,p_brief:brief,p_secret:secret}); }
  if (start.error) { console.error("begin generation failed",{code:start.error.code}); return Response.json({error:"Could not start generation. No credit was used."},{status:503}); }
  const job=start.data;
  if (job.login_required) return Response.json({login_required:true,error:job.reason==="network_limit"?"Free guest logos from this network are used up. Sign in with Google to continue.":"Sign in with Google to keep creating."},{status:401});
  if (job.payment_required) return Response.json({payment_required:true},{status:402});
  if (job.disabled) return Response.json({error:job.message||"Logo generation is temporarily paused."},{status:503});
  if (job.rate_limited) return Response.json({error:"Generation limit reached. Please try again later. No credit was used."},{status:429});
  if (job.in_progress || job.status==="processing") return Response.json({in_progress:true,error:"Your logo is still being created. Please wait a moment."},{status:409});
  if (job.status==="completed") {
    const old=await db.from("logo_concepts").select("*").eq("id",job.concept_id).single();
    if(old.error) return Response.json({error:"Could not restore the completed logo."},{status:500});
    return Response.json({id:old.data.id,project_id:old.data.project_id,brand:brief.brand,style:old.data.direction,svg:old.data.svg_markup,spec:old.data.specification,source:"saved"});
  }
  if (job.status!=="new") return Response.json({error:"This request expired. Please create a new logo."},{status:409});
  try {
    const result=await generateConcept(brief,{seed:requestId});
    const svg=renderLogo(brief.brand,result.spec,brief.tagline);
    const spec={...result.spec,styleId:brief.style,tagline:brief.tagline||undefined};
    const saved=await db.rpc(v2?"finish_ai_logo_v2":"finish_ai_logo",{p_job:job.job_id,p_spec:spec,p_svg:svg,p_model:result.model,p_tokens:result.tokens,p_secret:secret});
    if(saved.error) {
      console.error("finish generation failed",{code:saved.error.code});
      throw new ProviderError(/payment required/i.test(saved.error.message)?"Your free logos are used. Unlock more to continue.":"Your design could not be saved. Check My logos before retrying.",/payment required/i.test(saved.error.message)?402:503);
    }
    return Response.json({...saved.data,brand:brief.brand,style:result.spec.name,svg,spec,model:result.model,fallback:result.fallback});
  } catch(e) {
    await db.rpc("fail_ai_logo",{p_job:job.job_id,p_secret:secret});
    return Response.json({error:e instanceof ProviderError?e.message:"The request timed out or failed. Check My logos before retrying."},{status:e instanceof ProviderError?e.status:502});
  }
}
