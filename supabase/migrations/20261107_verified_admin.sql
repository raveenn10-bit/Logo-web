-- Grant payment review only to the owner of this verified email account.
-- New signups remain ordinary users until Supabase confirms mailbox ownership.
create or replace function public.sync_verified_logova_admin()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if lower(new.email)='charshan59@gmail.com' and new.email_confirmed_at is not null then
   insert into public.app_admins(user_id) values(new.id) on conflict do nothing;
 else
   delete from public.app_admins where user_id=new.id;
 end if;
 return new;
end $$;
drop trigger if exists on_logova_admin_verified on auth.users;
create trigger on_logova_admin_verified
after insert or update of email,email_confirmed_at on auth.users
for each row execute function public.sync_verified_logova_admin();
revoke execute on function public.sync_verified_logova_admin() from public,anon,authenticated;
insert into public.app_admins(user_id)
select id from auth.users where lower(email)='charshan59@gmail.com' and email_confirmed_at is not null
on conflict do nothing;
