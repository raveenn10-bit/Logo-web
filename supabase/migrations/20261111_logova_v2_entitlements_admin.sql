-- LOGOVA v2: server-side guest limits, configurable settings, admin operations and audit.
-- Additive and non-destructive: no tables, columns or rows are dropped. Existing
-- balances, payments and history are untouched. Safe to run more than once.

-- 1. Settings (single row) ---------------------------------------------------
create table if not exists public.logova_settings(
 id boolean primary key default true check(id),
 credits_per_payment int not null default 5 check(credits_per_payment between 1 and 50),
 free_generations int not null default 2 check(free_generations between 0 and 2),
 guest_free_generations int not null default 1 check(guest_free_generations between 0 and 2),
 guest_daily_limit_per_network int not null default 3 check(guest_daily_limit_per_network between 0 and 50),
 generation_enabled boolean not null default true,
 announcement text check(announcement is null or length(announcement)<=280),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id)
);
insert into public.logova_settings(id) values(true) on conflict(id) do nothing;
alter table public.logova_settings enable row level security;
revoke all on public.logova_settings from anon,authenticated;

-- 2. Admin audit trail for credit adjustments and settings changes -----------
create table if not exists public.logova_admin_audit(
 id uuid primary key default gen_random_uuid(),
 admin_id uuid not null references auth.users(id),
 action text not null,
 target_user uuid references auth.users(id) on delete set null,
 detail jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists logova_admin_audit_date on public.logova_admin_audit(created_at desc);
alter table public.logova_admin_audit enable row level security;
revoke all on public.logova_admin_audit from anon,authenticated;

-- 3. Additive columns ---------------------------------------------------------
alter table public.generation_jobs add column if not exists client_hash text;
create index if not exists generation_jobs_client_hash on public.generation_jobs(client_hash,created_at) where client_hash is not null;
alter table public.payment_requests add column if not exists credits_granted int;

-- 4. Helpers ------------------------------------------------------------------
create or replace function public.logova_is_anonymous()
returns boolean language sql stable security definer set search_path=public,auth as $$
 select coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
  or exists(select 1 from auth.users u where u.id=auth.uid() and coalesce(u.is_anonymous,false));
$$;
revoke execute on function public.logova_is_anonymous() from public,anon,authenticated;

create or replace function public.logova_current_settings()
returns public.logova_settings language sql stable security definer set search_path=public as $$
 select coalesce((select s from public.logova_settings s where s.id),row(true,5,2,1,3,true,null,now(),null)::public.logova_settings);
$$;
revoke execute on function public.logova_current_settings() from public,anon,authenticated;

create or replace function public.logova_public_settings()
returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('price_lkr',300,'credits_per_payment',s.credits_per_payment,'free_generations',s.free_generations,
  'guest_free_generations',s.guest_free_generations,'generation_enabled',s.generation_enabled,'announcement',s.announcement)
 from public.logova_current_settings() s;
$$;
revoke execute on function public.logova_public_settings() from public;
grant execute on function public.logova_public_settings() to anon,authenticated;

-- Entitlement summary for the signed-in user (guest or registered).
create or replace function public.logova_my_entitlements()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare s public.logova_settings; c public.user_credits; anon boolean; cap int;
begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 s:=public.logova_current_settings(); anon:=public.logova_is_anonymous();
 select * into c from public.user_credits where user_id=auth.uid();
 cap:=case when anon then s.guest_free_generations else s.free_generations end;
 return jsonb_build_object('is_guest',anon,'free_used',coalesce(c.free_used,0),'free_limit',cap,
  'free_remaining',greatest(0,cap-coalesce(c.free_used,0)),'paid_credits',coalesce(c.paid_credits,0),
  'credits_per_payment',s.credits_per_payment,'price_lkr',300,'generation_enabled',s.generation_enabled,'announcement',s.announcement);
end $$;
revoke execute on function public.logova_my_entitlements() from public,anon;
grant execute on function public.logova_my_entitlements() to authenticated;

-- 5. Generation entitlement (v2) ---------------------------------------------
-- Guests (anonymous sessions) are limited per account AND per salted network hash,
-- so clearing browser storage cannot mint unlimited free logos. Registered users
-- get the configured free allowance; linking Google keeps the same user id, so a
-- guest's free logo counts toward the registered allowance.
create or replace function public.begin_ai_logo_v2(p_request uuid,p_brief jsonb,p_secret text,p_client text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.user_credits; j public.generation_jobs; jid uuid; s public.logova_settings; anon boolean;
begin
 if auth.uid() is null or not public.check_logo_server(p_secret) then raise exception 'forbidden'; end if;
 if p_request is null or p_brief is null or length(p_brief->>'brand') not between 2 and 45 or length(p_brief::text)>3000 then raise exception 'invalid brief'; end if;
 if p_client is not null and p_client !~ '^[0-9a-f]{64}$' then raise exception 'invalid client'; end if;
 s:=public.logova_current_settings(); anon:=public.logova_is_anonymous();
 insert into public.user_credits(user_id) values(auth.uid()) on conflict do nothing;
 select * into c from public.user_credits where user_id=auth.uid() for update;
 select * into j from public.generation_jobs where owner_id=auth.uid() and request_key=p_request;
 if found then return jsonb_build_object('job_id',j.id,'status',j.status,'concept_id',j.concept_id); end if;
 update public.generation_jobs set status='failed',completed_at=now() where owner_id=auth.uid() and status='processing' and created_at<now()-interval '2 minutes';
 if exists(select 1 from public.generation_jobs where owner_id=auth.uid() and status='processing') then return jsonb_build_object('in_progress',true); end if;
 if not s.generation_enabled then return jsonb_build_object('disabled',true,'message',coalesce(s.announcement,'Logo generation is paused for maintenance. Please try again soon.')); end if;
 if (select count(*) from public.generation_jobs where owner_id=auth.uid() and created_at>now()-interval '1 hour')>=10 then return jsonb_build_object('rate_limited',true); end if;
 if (select count(*) from public.generation_jobs where created_at>now()-interval '1 day' and provider like 'gemini%')>=200 then return jsonb_build_object('rate_limited',true); end if;
 if anon then
  if c.free_used>=s.guest_free_generations then return jsonb_build_object('login_required',true); end if;
  if p_client is null or (select count(*) from public.generation_jobs where client_hash=p_client and created_at>now()-interval '1 day' and status in ('processing','completed'))>=s.guest_daily_limit_per_network then
   return jsonb_build_object('login_required',true,'reason','network_limit');
  end if;
 elsif c.free_used>=s.free_generations and c.paid_credits<1 then
  return jsonb_build_object('payment_required',true);
 end if;
 insert into public.generation_jobs(owner_id,status,provider,request_key,brief,client_hash)
 values(auth.uid(),'processing','gemini',p_request,p_brief,case when anon then p_client end) returning id into jid;
 return jsonb_build_object('job_id',jid,'status','new');
end $$;

create or replace function public.finish_ai_logo_v2(p_job uuid,p_spec jsonb,p_svg text,p_model text,p_tokens integer,p_secret text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.user_credits; j public.generation_jobs; pid uuid; cid uuid; source_name text; s public.logova_settings; anon boolean; cap int;
begin
 if auth.uid() is null or not public.check_logo_server(p_secret) then raise exception 'forbidden'; end if;
 s:=public.logova_current_settings(); anon:=public.logova_is_anonymous();
 cap:=case when anon then s.guest_free_generations else s.free_generations end;
 select * into c from public.user_credits where user_id=auth.uid() for update;
 select * into j from public.generation_jobs where id=p_job and owner_id=auth.uid() for update;
 if j.id is null then raise exception 'job not found'; end if;
 if j.status='completed' then return jsonb_build_object('id',j.concept_id,'project_id',j.project_id); end if;
 if j.status<>'processing' or j.created_at<now()-interval '2 minutes' then raise exception 'job expired'; end if;
 if c.free_used>=cap and (anon or c.paid_credits<1) then raise exception 'payment required'; end if;
 if p_spec is null or length(p_spec::text)>50000 or p_svg is null or length(p_svg)>50000 or p_svg not like '<svg%' or length(p_model)>100 then raise exception 'invalid concept'; end if;
 insert into public.projects(owner_id,name,status) values(auth.uid(),j.brief->>'brand','completed') returning id into pid;
 insert into public.brand_briefs(project_id,brief) values(pid,j.brief);
 insert into public.logo_concepts(project_id,direction,specification,svg_markup,selected)
 values(pid,p_spec->>'name',p_spec,p_svg,true) returning id into cid;
 if c.free_used<cap then update public.user_credits set free_used=free_used+1,updated_at=now() where user_id=auth.uid(); source_name:='free';
 else update public.user_credits set paid_credits=paid_credits-1,updated_at=now() where user_id=auth.uid(); source_name:='paid'; end if;
 insert into public.generation_ledger(user_id,source) values(auth.uid(),source_name);
 insert into public.usage_records(owner_id,metric,quantity) values(auth.uid(),'gemini_tokens',greatest(0,least(coalesce(p_tokens,0),100000)));
 update public.generation_jobs set status='completed',project_id=pid,concept_id=cid,provider=p_model,completed_at=now() where id=j.id;
 return jsonb_build_object('id',cid,'project_id',pid,'source',source_name);
end $$;
revoke execute on function public.begin_ai_logo_v2(uuid,jsonb,text,text),public.finish_ai_logo_v2(uuid,jsonb,text,text,integer,text) from public,anon;
grant execute on function public.begin_ai_logo_v2(uuid,jsonb,text,text),public.finish_ai_logo_v2(uuid,jsonb,text,text,integer,text) to authenticated;

-- 6. Payments -----------------------------------------------------------------
-- Registered accounts only; an open order from the last 24 hours is reused so a
-- customer keeps one payment reference instead of creating duplicates.
create or replace function public.create_logo_payment_request()
returns public.payment_requests language plpgsql security definer set search_path=public as $$
declare p public.payment_requests;
begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 if public.logova_is_anonymous() then raise exception 'Sign in with Google before buying credits'; end if;
 select * into p from public.payment_requests where user_id=auth.uid() and status='pending' and created_at>now()-interval '24 hours' order by created_at desc limit 1;
 if found then return p; end if;
 if (select count(*) from public.payment_requests where user_id=auth.uid() and created_at>now()-interval '1 hour')>=5 then raise exception 'Too many payment requests'; end if;
 insert into public.payment_requests(user_id) values(auth.uid()) returning * into p;
 return p;
end $$;

-- Approval is idempotent: the row is locked and only pending receipts can be
-- approved once. Credits per payment come from settings (default 5).
create or replace function public.review_logo_payment(p_payment uuid,p_approve boolean,p_reason text default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare p public.payment_requests; s public.logova_settings;
begin
 if auth.uid() is null or not exists(select 1 from public.app_admins where user_id=auth.uid()) then raise exception 'forbidden'; end if;
 select * into p from public.payment_requests where id=p_payment for update;
 if p.id is null or p.status in ('approved','rejected') then return false; end if;
 if p_approve then
  if p.status <> 'receipt_submitted' or p.receipt_path is null then raise exception 'receipt required before approval'; end if;
  if not exists(select 1 from storage.objects where bucket_id='payment-receipts' and name=p.receipt_path) then raise exception 'receipt missing'; end if;
  if p.amount_lkr <> 300 then raise exception 'unexpected payment amount'; end if;
  s:=public.logova_current_settings();
  update public.payment_requests set status='approved',reviewed_at=now(),reviewed_by=auth.uid(),credits_granted=s.credits_per_payment where id=p_payment;
  insert into public.user_credits(user_id,paid_credits) values(p.user_id,s.credits_per_payment)
  on conflict(user_id) do update set paid_credits=public.user_credits.paid_credits+s.credits_per_payment,updated_at=now();
  insert into public.payment_audit(payment_id,admin_id,action,reason) values(p_payment,auth.uid(),'approved_credits',s.credits_per_payment::text||' credits');
 else
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'rejection reason required'; end if;
  update public.payment_requests set status='rejected',rejection_reason=left(p_reason,500),reviewed_at=now(),reviewed_by=auth.uid() where id=p_payment;
  insert into public.payment_audit(payment_id,admin_id,action,reason) values(p_payment,auth.uid(),'rejected',left(p_reason,500));
 end if;
 return true;
end $$;
revoke execute on function public.create_logo_payment_request(),public.review_logo_payment(uuid,boolean,text) from public,anon;
grant execute on function public.create_logo_payment_request(),public.review_logo_payment(uuid,boolean,text) to authenticated;

-- 7. Admin read models and operations (all require app_admins membership) -----
create or replace function public.logo_admin_payments(p_status text default null,p_search text default null,p_limit integer default 100)
returns table(id uuid,order_id text,user_id uuid,email text,amount_lkr int,status text,receipt_path text,created_at timestamptz,reviewed_at timestamptz,credits_granted int,rejection_reason text)
language plpgsql security definer set search_path=public,auth as $$
begin
 if not public.is_logo_admin() then raise exception 'forbidden'; end if;
 return query select p.id,p.order_id,p.user_id,coalesce(u.email::text,'Deleted user'),p.amount_lkr,p.status,p.receipt_path,p.created_at,p.reviewed_at,p.credits_granted,p.rejection_reason
 from public.payment_requests p left join auth.users u on u.id=p.user_id
 where (p_status is null or p_status='all' or p.status=p_status)
  and (coalesce(p_search,'')='' or p.order_id ilike '%'||p_search||'%' or u.email ilike '%'||p_search||'%')
 order by (p.status='receipt_submitted') desc,p.created_at desc limit greatest(1,least(coalesce(p_limit,100),300));
end $$;

create or replace function public.logo_admin_users(p_search text default null,p_limit integer default 100)
returns table(id uuid,email text,provider text,is_guest boolean,created_at timestamptz,last_sign_in_at timestamptz,free_used int,paid_credits int,logos bigint,approved_payments bigint,is_admin boolean)
language plpgsql security definer set search_path=public,auth as $$
begin
 if not public.is_logo_admin() then raise exception 'forbidden'; end if;
 return query select u.id,coalesce(u.email::text,''),coalesce(u.raw_app_meta_data->>'provider',case when coalesce(u.is_anonymous,false) then 'anonymous' else 'email' end),
  coalesce(u.is_anonymous,false),u.created_at,u.last_sign_in_at,coalesce(c.free_used,0),coalesce(c.paid_credits,0),
  (select count(*) from public.generation_ledger g where g.user_id=u.id),
  (select count(*) from public.payment_requests p where p.user_id=u.id and p.status='approved'),
  exists(select 1 from public.app_admins a where a.user_id=u.id)
 from auth.users u left join public.user_credits c on c.user_id=u.id
 where coalesce(p_search,'')='' or u.email ilike '%'||p_search||'%' or u.id::text=p_search
 order by u.created_at desc limit greatest(1,least(coalesce(p_limit,100),300));
end $$;

create or replace function public.logo_admin_adjust_credits(p_user uuid,p_delta integer,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.user_credits;
begin
 if not public.is_logo_admin() then raise exception 'forbidden'; end if;
 if p_user is null or p_delta is null or p_delta=0 or p_delta not between -100 and 100 then raise exception 'credit change must be between -100 and 100'; end if;
 if length(trim(coalesce(p_reason,'')))<5 then raise exception 'reason required (at least 5 characters)'; end if;
 if not exists(select 1 from auth.users where id=p_user) then raise exception 'user not found'; end if;
 insert into public.user_credits(user_id) values(p_user) on conflict do nothing;
 select * into c from public.user_credits where user_id=p_user for update;
 if c.paid_credits+p_delta<0 then raise exception 'balance cannot go below zero'; end if;
 update public.user_credits set paid_credits=paid_credits+p_delta,updated_at=now() where user_id=p_user returning * into c;
 insert into public.logova_admin_audit(admin_id,action,target_user,detail)
 values(auth.uid(),'credits_adjusted',p_user,jsonb_build_object('delta',p_delta,'balance_after',c.paid_credits,'reason',left(trim(p_reason),300)));
 return jsonb_build_object('paid_credits',c.paid_credits);
end $$;

create or replace function public.logo_admin_generations(p_status text default null,p_limit integer default 40)
returns table(id uuid,created_at timestamptz,completed_at timestamptz,status text,provider text,owner_email text,is_guest boolean,brand text,style text,concept_id uuid,svg text)
language plpgsql security definer set search_path=public,auth as $$
begin
 if not public.is_logo_admin() then raise exception 'forbidden'; end if;
 return query select j.id,j.created_at,j.completed_at,j.status::text,j.provider::text,coalesce(u.email::text,case when coalesce(u.is_anonymous,false) then 'Guest' else 'Deleted user' end),
  coalesce(u.is_anonymous,false),coalesce(j.brief->>'brand',''),coalesce(j.brief->>'style',''),j.concept_id,lc.svg_markup
 from public.generation_jobs j left join auth.users u on u.id=j.owner_id left join public.logo_concepts lc on lc.id=j.concept_id
 where p_status is null or p_status='all' or j.status::text=p_status
 order by j.created_at desc limit greatest(1,least(coalesce(p_limit,40),100));
end $$;

create or replace function public.logo_admin_audit(p_limit integer default 100)
returns table(created_at timestamptz,category text,action text,admin_email text,target text,detail text)
language plpgsql security definer set search_path=public,auth as $$
begin
 if not public.is_logo_admin() then raise exception 'forbidden'; end if;
 return query select * from (
  select a.created_at,'payment'::text,a.action,coalesce(u.email::text,'Deleted user'),coalesce(p.order_id,''),coalesce(a.reason,'')
  from public.payment_audit a left join auth.users u on u.id=a.admin_id left join public.payment_requests p on p.id=a.payment_id
  union all
  select l.created_at,case when l.action like 'settings%' then 'settings' else 'credits' end,l.action,coalesce(u.email::text,'Deleted user'),coalesce(t.email::text,''),l.detail::text
  from public.logova_admin_audit l left join auth.users u on u.id=l.admin_id left join auth.users t on t.id=l.target_user
 ) x order by 1 desc limit greatest(1,least(coalesce(p_limit,100),300));
end $$;

create or replace function public.logo_admin_daily(p_days integer default 14)
returns table(day date,generations bigint,completed bigint,failed bigint,new_users bigint,revenue_lkr bigint)
language plpgsql security definer set search_path=public,auth as $$
declare n int:=greatest(1,least(coalesce(p_days,14),90));
begin
 if not public.is_logo_admin() then raise exception 'forbidden'; end if;
 return query select d::date,
  (select count(*) from public.generation_jobs j where j.created_at>=d and j.created_at<d+interval '1 day'),
  (select count(*) from public.generation_jobs j where j.status='completed' and j.created_at>=d and j.created_at<d+interval '1 day'),
  (select count(*) from public.generation_jobs j where j.status='failed' and j.created_at>=d and j.created_at<d+interval '1 day'),
  (select count(*) from auth.users u where u.created_at>=d and u.created_at<d+interval '1 day'),
  (select coalesce(sum(p.amount_lkr),0)::bigint from public.payment_requests p where p.status='approved' and p.reviewed_at>=d and p.reviewed_at<d+interval '1 day')
 from generate_series(date_trunc('day',now())-(n-1)*interval '1 day',date_trunc('day',now()),interval '1 day') d order by 1;
end $$;

create or replace function public.logo_admin_get_settings()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare s public.logova_settings;
begin
 if not public.is_logo_admin() then raise exception 'forbidden'; end if;
 s:=public.logova_current_settings();
 return to_jsonb(s)-'id';
end $$;

create or replace function public.logo_admin_update_settings(p_settings jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare before jsonb; s public.logova_settings;
begin
 if not public.is_logo_admin() then raise exception 'forbidden'; end if;
 if p_settings is null or jsonb_typeof(p_settings)<>'object' then raise exception 'invalid settings'; end if;
 insert into public.logova_settings(id) values(true) on conflict(id) do nothing;
 select to_jsonb(x)-'id' into before from public.logova_settings x where x.id for update;
 update public.logova_settings set
  credits_per_payment=coalesce((p_settings->>'credits_per_payment')::int,credits_per_payment),
  free_generations=coalesce((p_settings->>'free_generations')::int,free_generations),
  guest_free_generations=coalesce((p_settings->>'guest_free_generations')::int,guest_free_generations),
  guest_daily_limit_per_network=coalesce((p_settings->>'guest_daily_limit_per_network')::int,guest_daily_limit_per_network),
  generation_enabled=coalesce((p_settings->>'generation_enabled')::boolean,generation_enabled),
  announcement=case when p_settings ? 'announcement' then nullif(left(trim(coalesce(p_settings->>'announcement','')),280),'') else announcement end,
  updated_at=now(),updated_by=auth.uid()
 where id returning * into s;
 insert into public.logova_admin_audit(admin_id,action,detail) values(auth.uid(),'settings_updated',jsonb_build_object('before',before,'after',to_jsonb(s)-'id'));
 return to_jsonb(s)-'id';
end $$;

-- Extended overview: keeps every key the previous version returned.
create or replace function public.logo_admin_overview()
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare result jsonb;
begin
 if not public.is_logo_admin() then raise exception 'forbidden'; end if;
 select jsonb_build_object(
  'users', (select count(*) from auth.users),
  'registered_users', (select count(*) from auth.users where not coalesce(is_anonymous,false)),
  'guest_users', (select count(*) from auth.users where coalesce(is_anonymous,false)),
  'projects', (select count(*) from public.projects),
  'logos', (select count(*) from public.logo_concepts),
  'free_generations', (select count(*) from public.generation_ledger where source='free'),
  'paid_generations', (select count(*) from public.generation_ledger where source='paid'),
  'generations_today', (select count(*) from public.generation_jobs where created_at>=date_trunc('day',now())),
  'revenue_lkr', (select coalesce(sum(amount_lkr),0) from public.payment_requests where status='approved'),
  'approved_payments', (select count(*) from public.payment_requests where status='approved'),
  'pending_payments', (select count(*) from public.payment_requests where status in ('pending','receipt_submitted')),
  'awaiting_review', (select count(*) from public.payment_requests where status='receipt_submitted'),
  'failed_jobs', (select count(*) from public.generation_jobs where status='failed'),
  'ai_tokens', (select coalesce(sum(quantity),0) from public.usage_records where metric='gemini_tokens'),
  'outstanding_credits', (select coalesce(sum(paid_credits),0) from public.user_credits),
  'clients', (select count(*) from public.clients)
 ) into result;
 return result;
end $$;

revoke execute on function public.logo_admin_payments(text,text,integer),public.logo_admin_users(text,integer),public.logo_admin_adjust_credits(uuid,integer,text),
 public.logo_admin_generations(text,integer),public.logo_admin_audit(integer),public.logo_admin_daily(integer),public.logo_admin_get_settings(),
 public.logo_admin_update_settings(jsonb),public.logo_admin_overview() from public,anon;
grant execute on function public.logo_admin_payments(text,text,integer),public.logo_admin_users(text,integer),public.logo_admin_adjust_credits(uuid,integer,text),
 public.logo_admin_generations(text,integer),public.logo_admin_audit(integer),public.logo_admin_daily(integer),public.logo_admin_get_settings(),
 public.logo_admin_update_settings(jsonb),public.logo_admin_overview() to authenticated;
