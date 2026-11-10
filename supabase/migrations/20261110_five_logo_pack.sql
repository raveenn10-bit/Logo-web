-- Each newly approved LKR 300 payment buys five completed logo concepts.
-- Existing approved orders and balances are intentionally left untouched.
create or replace function public.review_logo_payment(p_payment uuid,p_approve boolean,p_reason text default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare p public.payment_requests;
begin
 if auth.uid() is null or not exists(select 1 from public.app_admins where user_id=auth.uid()) then raise exception 'forbidden'; end if;
 select * into p from public.payment_requests where id=p_payment for update;
 if p.id is null or p.status in ('approved','rejected') then return false; end if;
 if p_approve then
  if p.status <> 'receipt_submitted' or p.receipt_path is null then raise exception 'receipt required before approval'; end if;
  if not exists(select 1 from storage.objects where bucket_id='payment-receipts' and name=p.receipt_path) then raise exception 'receipt missing'; end if;
  if p.amount_lkr <> 300 then raise exception 'unexpected payment amount'; end if;
  update public.payment_requests set status='approved',reviewed_at=now(),reviewed_by=auth.uid() where id=p_payment;
  insert into public.user_credits(user_id,paid_credits) values(p.user_id,5)
  on conflict(user_id) do update set paid_credits=public.user_credits.paid_credits+5,updated_at=now();
  insert into public.payment_audit(payment_id,admin_id,action) values(p_payment,auth.uid(),'approved_five_credits');
 else
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'rejection reason required'; end if;
  update public.payment_requests set status='rejected',rejection_reason=left(p_reason,500),reviewed_at=now(),reviewed_by=auth.uid() where id=p_payment;
  insert into public.payment_audit(payment_id,admin_id,action,reason) values(p_payment,auth.uid(),'rejected',left(p_reason,500));
 end if;
 return true;
end $$;
revoke execute on function public.review_logo_payment(uuid,boolean,text) from public,anon;
grant execute on function public.review_logo_payment(uuid,boolean,text) to authenticated;
