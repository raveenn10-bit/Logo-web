-- Logova manual payment workflow. Apply to the existing Supabase project.
create table if not exists public.user_credits(
 user_id uuid primary key references auth.users(id) on delete cascade,
 free_used int not null default 0 check(free_used between 0 and 2),
 paid_credits int not null default 0 check(paid_credits>=0),
 updated_at timestamptz not null default now()
);
create table if not exists public.payment_requests(
 id uuid primary key default gen_random_uuid(),
 order_id text not null unique default ('LOG-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
 user_id uuid not null references auth.users(id),
 amount_lkr int not null default 300 check(amount_lkr=300),
 status text not null default 'pending' check(status in ('pending','receipt_submitted','approved','rejected')),
 receipt_path text,rejection_reason text,created_at timestamptz not null default now(),
 reviewed_at timestamptz,reviewed_by uuid references auth.users(id)
);
create table if not exists public.payment_audit(
 id uuid primary key default gen_random_uuid(),payment_id uuid not null references public.payment_requests(id),
 admin_id uuid not null references auth.users(id),action text not null,reason text,created_at timestamptz not null default now()
);
create table if not exists public.app_admins(user_id uuid primary key references auth.users(id));
create table if not exists public.generation_ledger(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),
 source text not null check(source in ('free','paid')),created_at timestamptz not null default now()
);
create index if not exists payment_requests_user_date on public.payment_requests(user_id,created_at desc);
create index if not exists generation_ledger_user_date on public.generation_ledger(user_id,created_at desc);
alter table public.user_credits enable row level security;
alter table public.payment_requests enable row level security;
alter table public.payment_audit enable row level security;
alter table public.app_admins enable row level security;
alter table public.generation_ledger enable row level security;
drop policy if exists "own credits" on public.user_credits;
create policy "own credits" on public.user_credits for select to authenticated using(user_id=auth.uid());
drop policy if exists "own payment requests" on public.payment_requests;
create policy "own payment requests" on public.payment_requests for select to authenticated using(user_id=auth.uid());
drop policy if exists "own generation history" on public.generation_ledger;
create policy "own generation history" on public.generation_ledger for select to authenticated using(user_id=auth.uid());
drop policy if exists "own create requests" on public.payment_requests;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('payment-receipts','payment-receipts',false,5000000,array['image/jpeg','image/png','image/webp','application/pdf']::text[])
on conflict(id) do update set public=false,file_size_limit=5000000,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "receipt own upload" on storage.objects;
create policy "receipt own upload" on storage.objects for insert to authenticated
with check(bucket_id='payment-receipts' and (storage.foldername(name))[1]=auth.uid()::text
and lower(storage.extension(name))=any(array['jpg','jpeg','png','webp','pdf']));
drop policy if exists "receipt own read" on storage.objects;
create policy "receipt own read" on storage.objects for select to authenticated
using(bucket_id='payment-receipts' and ((storage.foldername(name))[1]=auth.uid()::text or exists(select 1 from public.app_admins where user_id=auth.uid())));
create or replace function public.create_logo_payment_request()
returns public.payment_requests language plpgsql security definer set search_path=public as $$
declare p public.payment_requests;
begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 if (select count(*) from public.payment_requests where user_id=auth.uid() and created_at>now()-interval '1 hour')>=5 then raise exception 'Too many payment requests'; end if;
 insert into public.payment_requests(user_id) values(auth.uid()) returning * into p;
 return p;
end $$;
create or replace function public.submit_payment_receipt(p_payment uuid,p_path text)
returns boolean language plpgsql security definer set search_path=public,storage as $$
begin
 if auth.uid() is null or p_path not like auth.uid()::text||'/'||p_payment::text||'/%' then raise exception 'invalid receipt path'; end if;
 if not exists(select 1 from storage.objects where bucket_id='payment-receipts' and name=p_path) then raise exception 'receipt upload missing'; end if;
 update public.payment_requests set receipt_path=p_path,status='receipt_submitted',rejection_reason=null
 where id=p_payment and user_id=auth.uid() and status in ('pending','rejected');
 return found;
end $$;
create or replace function public.is_logo_admin() returns boolean language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and exists(select 1 from public.app_admins where user_id=auth.uid())
$$;
create or replace function public.list_logo_payments_admin()
returns table(id uuid,order_id text,user_id uuid,email text,amount_lkr int,status text,receipt_path text,created_at timestamptz)
language plpgsql security definer set search_path=public as $$
begin
 if not public.is_logo_admin() then raise exception 'forbidden'; end if;
 return query select p.id,p.order_id,p.user_id,u.email::text,p.amount_lkr,p.status,p.receipt_path,p.created_at
 from public.payment_requests p join auth.users u on u.id=p.user_id order by p.created_at desc limit 100;
end $$;
create or replace function public.review_logo_payment(p_payment uuid,p_approve boolean,p_reason text default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare p public.payment_requests;
begin
 if not public.is_logo_admin() then raise exception 'forbidden'; end if;
 select * into p from public.payment_requests where id=p_payment for update;
 if p.id is null or p.status in ('approved','rejected') then return false; end if;
 if p_approve then
  if p.status<>'receipt_submitted' or p.receipt_path is null or not exists(select 1 from storage.objects where bucket_id='payment-receipts' and name=p.receipt_path) then raise exception 'receipt required'; end if;
  update public.payment_requests set status='approved',reviewed_at=now(),reviewed_by=auth.uid() where id=p_payment;
  insert into public.user_credits(user_id,paid_credits) values(p.user_id,1) on conflict(user_id) do update set paid_credits=public.user_credits.paid_credits+1,updated_at=now();
  insert into public.payment_audit(payment_id,admin_id,action) values(p_payment,auth.uid(),'approved');
 else
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'rejection reason required'; end if;
  update public.payment_requests set status='rejected',rejection_reason=left(p_reason,500),reviewed_at=now(),reviewed_by=auth.uid() where id=p_payment;
  insert into public.payment_audit(payment_id,admin_id,action,reason) values(p_payment,auth.uid(),'rejected',left(p_reason,500));
 end if;
 return true;
end $$;
revoke execute on function public.consume_logo_credit() from public,anon,authenticated;
revoke execute on function public.is_logo_admin() from public,anon;
grant execute on function public.is_logo_admin() to authenticated;
revoke all on public.payment_requests from anon,authenticated;
grant select on public.payment_requests to authenticated;
revoke all on public.app_admins from anon,authenticated;
grant select on public.app_admins to authenticated;

revoke execute on function public.consume_generation_credit(uuid) from public,anon,authenticated;
revoke execute on function public.handle_new_user() from public,anon,authenticated;
revoke execute on function public.create_logo_payment_request() from public,anon;
revoke execute on function public.submit_payment_receipt(uuid,text) from public,anon;
revoke execute on function public.review_logo_payment(uuid,boolean,text) from public,anon;
revoke execute on function public.list_logo_payments_admin() from public,anon;
grant execute on function public.create_logo_payment_request() to authenticated;
grant execute on function public.submit_payment_receipt(uuid,text) to authenticated;
grant execute on function public.review_logo_payment(uuid,boolean,text) to authenticated;
grant execute on function public.list_logo_payments_admin() to authenticated;
