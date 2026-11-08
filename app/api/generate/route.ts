import {createClient} from "@supabase/supabase-js";
import {generateConcept,parseBrief,ProviderError} from "../../../lib/gemini";
import {renderLogo} from "../../../lib/logo";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  const token = request.headers.get("authorization");
  if (!token?.startsWith("Bearer ")) return Response.json({error:"Sign in to create a logo."},{status:401});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,secret=process.env.AI_SERVER_SECRET;
  if (!url || !key || !secret || !process.env.GEMINI_API_KEY) return Response.json({error:"AI generation is not configured. No credit was used."},{status:503});
  if (Number(request.headers.get("content-length")||0)>6000) return Response.json({error:"Brief is too large."},{status:413});
  const db=createClient(url,key,{global:{headers:{Authorization:token}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:authError}=await db.auth.getUser(token.slice(7));
  if (authError || !user) return Response.json({error:"Your session expired. Please sign in again."},{status:401});
  let brief,requestId;
  try {
    const raw=await request.text();
    if (raw.length>6000) throw new Error("Brief is too large.");
    const body=JSON.parse(raw); brief=parseBrief(body);
    requestId=body.requestId;
    if (typeof requestId!=="string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) throw new Error("Invalid generation request.");
  } catch(e) { return Response.json({error:e instanceof Error?e.message:"Invalid request."},{status:400}); }
  const start=await db.rpc("begin_ai_logo",{p_request:requestId,p_brief:brief,p_secret:secret});
  if (start.error) return Response.json({error:"Could not start generation. No credit was used."},{status:503});
  const job=start.data;
  if (job.payment_required) return Response.json({payment_required:true},{status:402});
  if (job.rate_limited) return Response.json({error:"Generation limit reached. Please try again later. No credit was used."},{status:429});
  if (job.in_progress || job.status==="processing") return Response.json({error:"A logo is already being created. Please wait."},{status:409});
  if (job.status==="completed") {
    const old=await db.from("logo_concepts").select("*").eq("id",job.concept_id).single();
    if(old.error) return Response.json({error:"Could not restore the completed logo."},{status:500});
    return Response.json({id:old.data.id,project_id:old.data.project_id,brand:brief.brand,style:old.data.direction,svg:old.data.svg_markup,spec:old.data.specification,source:"saved"});
  }
  if (job.status!=="new") return Response.json({error:"This request expired. Please create a new logo."},{status:409});
  try {
    const result=await generateConcept(brief);
    const svg=renderLogo(brief.brand,result.spec);
    const saved=await db.rpc("finish_ai_logo",{p_job:job.job_id,p_spec:result.spec,p_svg:svg,p_model:result.model,p_tokens:result.tokens,p_secret:secret});
    if(saved.error) throw new ProviderError("Your design could not be saved. Check My logos before retrying.",503);
    return Response.json({...saved.data,brand:brief.brand,style:result.spec.name,svg,spec:result.spec,model:result.model});
  } catch(e) {
    await db.rpc("fail_ai_logo",{p_job:job.job_id,p_secret:secret});
    return Response.json({error:e instanceof ProviderError?e.message:"The request timed out or failed. Check My logos before retrying."},{status:e instanceof ProviderError?e.status:502});
  }
}
