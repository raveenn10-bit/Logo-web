create schema if not exists logova_private;
revoke all on schema logova_private from public,anon,authenticated;
create table if not exists logova_private.server_config(name text primary key,value text not null);
revoke all on logova_private.server_config from public,anon,authenticated;
create or replace function public.check_logo_server(p_secret text)
returns boolean language sql security definer set search_path=pg_catalog as $$
 select p_secret is not null and exists(select 1 from logova_private.server_config where name='ai_secret_hash' and value=encode(sha256(convert_to(p_secret,'UTF8')),'hex'));
$$;
revoke execute on function public.check_logo_server(text) from public,anon,authenticated;

alter table public.generation_jobs add column if not exists request_key uuid;
alter table public.generation_jobs add column if not exists brief jsonb;
alter table public.generation_jobs add column if not exists concept_id uuid references public.logo_concepts(id);
create unique index if not exists generation_jobs_request_key on public.generation_jobs(owner_id,request_key);
create index if not exists generation_jobs_owner_created on public.generation_jobs(owner_id,created_at);
revoke insert,update,delete on public.generation_jobs from anon,authenticated;
revoke execute on function public.complete_logo_concept(text,text,integer) from public,anon,authenticated;

create or replace function public.begin_ai_logo(p_request uuid,p_brief jsonb,p_secret text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.user_credits; j public.generation_jobs; jid uuid;
begin
 if auth.uid() is null or not public.check_logo_server(p_secret) then raise exception 'forbidden'; end if;
 if p_request is null or p_brief is null or length(p_brief->>'brand') not between 2 and 45 or length(p_brief::text)>3000 then raise exception 'invalid brief'; end if;
 insert into public.user_credits(user_id) values(auth.uid()) on conflict do nothing;
 select * into c from public.user_credits where user_id=auth.uid() for update;
 select * into j from public.generation_jobs where owner_id=auth.uid() and request_key=p_request;
 if found then return jsonb_build_object('job_id',j.id,'status',j.status,'concept_id',j.concept_id); end if;
 update public.generation_jobs set status='failed',completed_at=now() where owner_id=auth.uid() and status='processing' and created_at<now()-interval '2 minutes';
 if exists(select 1 from public.generation_jobs where owner_id=auth.uid() and status='processing') then return jsonb_build_object('in_progress',true); end if;
 if (select count(*) from public.generation_jobs where owner_id=auth.uid() and created_at>now()-interval '1 hour')>=10 then return jsonb_build_object('rate_limited',true); end if;
 if (select count(*) from public.generation_jobs where created_at>now()-interval '1 day' and provider like 'gemini%')>=200 then return jsonb_build_object('rate_limited',true); end if;
 if c.free_used>=2 and c.paid_credits<1 then return jsonb_build_object('payment_required',true); end if;
 insert into public.generation_jobs(owner_id,status,provider,request_key,brief) values(auth.uid(),'processing','gemini',p_request,p_brief) returning id into jid;
 return jsonb_build_object('job_id',jid,'status','new');
end $$;

create or replace function public.finish_ai_logo(p_job uuid,p_spec jsonb,p_svg text,p_model text,p_tokens integer,p_secret text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.user_credits; j public.generation_jobs; pid uuid; cid uuid; source_name text;
begin
 if auth.uid() is null or not public.check_logo_server(p_secret) then raise exception 'forbidden'; end if;
 select * into c from public.user_credits where user_id=auth.uid() for update;
 select * into j from public.generation_jobs where id=p_job and owner_id=auth.uid() for update;
 if j.id is null then raise exception 'job not found'; end if;
 if j.status='completed' then return jsonb_build_object('id',j.concept_id,'project_id',j.project_id); end if;
 if j.status<>'processing' or j.created_at<now()-interval '2 minutes' then raise exception 'job expired'; end if;
 if c.free_used>=2 and c.paid_credits<1 then raise exception 'payment required'; end if;
 if p_spec is null or length(p_spec::text)>50000 or p_svg is null or length(p_svg)>50000 or p_svg not like '<svg%' or length(p_model)>100 then raise exception 'invalid concept'; end if;
 insert into public.projects(owner_id,name,status) values(auth.uid(),j.brief->>'brand','completed') returning id into pid;
 insert into public.brand_briefs(project_id,brief) values(pid,j.brief);
 insert into public.logo_concepts(project_id,direction,specification,svg_markup,selected)
 values(pid,p_spec->>'name',p_spec,p_svg,true) returning id into cid;
 if c.free_used<2 then update public.user_credits set free_used=free_used+1,updated_at=now() where user_id=auth.uid(); source_name:='free';
 else update public.user_credits set paid_credits=paid_credits-1,updated_at=now() where user_id=auth.uid(); source_name:='paid'; end if;
 insert into public.generation_ledger(user_id,source) values(auth.uid(),source_name);
 insert into public.usage_records(owner_id,metric,quantity) values(auth.uid(),'gemini_tokens',greatest(0,least(coalesce(p_tokens,0),100000)));
 update public.generation_jobs set status='completed',project_id=pid,concept_id=cid,provider=p_model,completed_at=now() where id=j.id;
 return jsonb_build_object('id',cid,'project_id',pid,'source',source_name);
end $$;

create or replace function public.fail_ai_logo(p_job uuid,p_secret text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or not public.check_logo_server(p_secret) then raise exception 'forbidden'; end if;
 update public.generation_jobs set status='failed',completed_at=now() where id=p_job and owner_id=auth.uid() and status='processing';
 return found;
end $$;
revoke execute on function public.begin_ai_logo(uuid,jsonb,text),public.finish_ai_logo(uuid,jsonb,text,text,integer,text),public.fail_ai_logo(uuid,text) from public,anon;
grant execute on function public.begin_ai_logo(uuid,jsonb,text),public.finish_ai_logo(uuid,jsonb,text,text,integer,text),public.fail_ai_logo(uuid,text) to authenticated;
