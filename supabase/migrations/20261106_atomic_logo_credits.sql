-- Atomic saved concept creation: credit is consumed only if all writes succeed.
create or replace function public.complete_logo_concept(p_brand text,p_industry text,p_style integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.user_credits; project_id uuid; concept_id uuid; mark text; fg text; bg text; style_name text; brand_clean text; svg text; source_name text;
begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 p_brand:=trim(p_brand);p_industry:=trim(coalesce(p_industry,''));
 if length(p_brand)<2 or length(p_brand)>45 or length(p_industry)>80 or p_style is null or p_style<0 or p_style>6 then raise exception 'invalid logo brief'; end if;
 if (select count(*) from public.generation_ledger where user_id=auth.uid() and created_at>now()-interval '1 minute')>=3 then raise exception 'Please wait a minute before creating more logos'; end if;
 insert into public.user_credits(user_id) values(auth.uid()) on conflict do nothing;
 select * into c from public.user_credits where user_id=auth.uid() for update;
 if c.free_used>=2 and c.paid_credits<1 then return jsonb_build_object('payment_required',true); end if;
 style_name:=(array['Minimalist Mark','Brand Identity','Luxury Identity','Wordmark','Symbol + Wordmark','Concept Driven','Complete Brief'])[p_style+1];
 fg:=case when p_style in (2,4) then '#f5f0e6' else '#19263b' end;
 bg:=case when p_style in (2,4) then '#19263b' else '#f8f6f0' end;
 mark:=(array['◒','✦','◇','Aa','◈','✳','✦'])[p_style+1];
 brand_clean:=replace(replace(replace(replace(replace(p_brand,'&','&amp;'),'<','&lt;'),'>','&gt;'),'"','&quot;'),'''','&apos;');
 svg:=format('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" role="img" aria-label="Logo for %s"><rect width="800" height="500" fill="%s"/><circle cx="400" cy="166" r="82" fill="#ff7a00"/><text x="400" y="196" text-anchor="middle" fill="%s" font-size="85" font-family="Arial, sans-serif">%s</text><text x="400" y="330" text-anchor="middle" fill="%s" font-size="57" font-weight="700" font-family="Arial, sans-serif">%s</text><path d="M310 360H490" stroke="#ff7a00" stroke-width="4"/></svg>',brand_clean,bg,fg,mark,fg,brand_clean);
 insert into public.projects(owner_id,name,status) values(auth.uid(),p_brand,'completed') returning id into project_id;
 insert into public.brand_briefs(project_id,brief) values(project_id,jsonb_build_object('brand',p_brand,'industry',p_industry,'style',style_name));
 insert into public.logo_concepts(project_id,direction,specification,svg_markup,selected) values(project_id,style_name,jsonb_build_object('brand',p_brand,'industry',p_industry,'palette',jsonb_build_array(fg,bg,'#ff7a00')),svg,true) returning id into concept_id;
 if c.free_used<2 then
  update public.user_credits set free_used=free_used+1,updated_at=now() where user_id=auth.uid();source_name:='free';
 else
  update public.user_credits set paid_credits=paid_credits-1,updated_at=now() where user_id=auth.uid();source_name:='paid';
 end if;
 insert into public.generation_ledger(user_id,source) values(auth.uid(),source_name);
 return jsonb_build_object('id',concept_id,'project_id',project_id,'brand',p_brand,'style',style_name,'svg',svg,'source',source_name);
end $$;
revoke execute on function public.complete_logo_concept(text,text,integer) from public,anon;
grant execute on function public.complete_logo_concept(text,text,integer) to authenticated;
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.profiles(id,full_name,role) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''),'user'::public.app_role) on conflict(id) do nothing;
 insert into public.user_credits(user_id) values(new.id) on conflict(user_id) do nothing;
 return new;
end $$;
revoke all on public.profiles from anon,authenticated;
grant select on public.profiles to authenticated;
grant update(full_name) on public.profiles to authenticated;
