-- Secure read models for Logova dashboards. Admin-only functions never expose auth.users directly.
create or replace function public.logo_admin_overview()
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare result jsonb;
begin
 if not public.is_logo_admin() then raise exception 'forbidden'; end if;
 select jsonb_build_object(
  'users', (select count(*) from auth.users),
  'projects', (select count(*) from public.projects),
  'logos', (select count(*) from public.logo_concepts),
  'free_generations', (select count(*) from public.generation_ledger where source='free'),
  'paid_generations', (select count(*) from public.generation_ledger where source='paid'),
  'revenue_lkr', (select coalesce(sum(amount_lkr),0) from public.payment_requests where status='approved'),
  'pending_payments', (select count(*) from public.payment_requests where status in ('pending','receipt_submitted')),
  'failed_jobs', (select count(*) from public.generation_jobs where status='failed'),
  'ai_tokens', (select coalesce(sum(quantity),0) from public.usage_records where metric='gemini_tokens'),
  'clients', (select count(*) from public.clients)
 ) into result;
 return result;
end $$;

create or replace function public.logo_admin_activity(p_limit integer default 80)
returns table(created_at timestamptz,category text,event text,actor_email text,detail text)
language plpgsql security definer set search_path=public,auth as $$
begin
 if not public.is_logo_admin() then raise exception 'forbidden'; end if;
 return query
 select * from (
  select j.created_at,'generation'::text,coalesce(j.status,'unknown'),coalesce(u.email::text,'Deleted user'),coalesce(j.provider,'Logo generation')
  from public.generation_jobs j left join auth.users u on u.id=j.owner_id
  union all
  select p.created_at,'payment'::text,p.status,coalesce(u.email::text,'Deleted user'),p.order_id||' · LKR '||p.amount_lkr::text
  from public.payment_requests p left join auth.users u on u.id=p.user_id
  union all
  select c.created_at,'client'::text,'created',coalesce(u.email::text,'Deleted user'),c.name
  from public.clients c left join auth.users u on u.id=c.owner_id
 ) activity order by created_at desc limit greatest(1,least(coalesce(p_limit,80),200));
end $$;

create or replace function public.logo_admin_clients(p_limit integer default 100)
returns table(id uuid,name text,email text,owner_email text,created_at timestamptz,project_count bigint)
language plpgsql security definer set search_path=public,auth as $$
begin
 if not public.is_logo_admin() then raise exception 'forbidden'; end if;
 return query select c.id,c.name,c.email,coalesce(u.email::text,'Deleted user'),c.created_at,count(p.id)
 from public.clients c left join auth.users u on u.id=c.owner_id left join public.projects p on p.client_id=c.id
 group by c.id,u.email order by c.created_at desc limit greatest(1,least(coalesce(p_limit,100),200));
end $$;

create or replace function public.log_logo_payment_audit()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='UPDATE' and old.status is distinct from new.status then
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(coalesce(new.reviewed_by,new.user_id),'payment_'||new.status,'payment_request',new.id,jsonb_build_object('order_id',new.order_id,'amount_lkr',new.amount_lkr));
 end if;
 return new;
end $$;
drop trigger if exists log_logo_payment_audit on public.payment_requests;
create trigger log_logo_payment_audit after update on public.payment_requests for each row execute function public.log_logo_payment_audit();

revoke execute on function public.logo_admin_overview(),public.logo_admin_activity(integer),public.logo_admin_clients(integer) from public,anon;
grant execute on function public.logo_admin_overview(),public.logo_admin_activity(integer),public.logo_admin_clients(integer) to authenticated;
