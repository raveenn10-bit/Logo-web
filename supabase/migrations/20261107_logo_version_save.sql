create or replace function public.save_logo_version(p_concept uuid,p_canvas jsonb,p_svg text)
returns public.logo_versions language plpgsql security definer set search_path=public as $$
declare item public.logo_concepts; version public.logo_versions;
begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 select c.* into item from public.logo_concepts c join public.projects p on p.id=c.project_id where c.id=p_concept and p.owner_id=auth.uid() for update of c;
 if item.id is null then raise exception 'concept not found'; end if;
 if p_canvas is null or jsonb_typeof(p_canvas)<>'object' or length(p_canvas::text)>500000 or p_svg is null or length(p_svg)>500000 or p_svg not like '<svg%' then raise exception 'invalid logo version'; end if;
 insert into public.logo_versions(concept_id,canvas_state,svg_markup) values(p_concept,p_canvas,p_svg) returning * into version;
 update public.logo_concepts set svg_markup=p_svg where id=p_concept;
 return version;
end $$;
revoke execute on function public.save_logo_version(uuid,jsonb,text) from public,anon;
grant execute on function public.save_logo_version(uuid,jsonb,text) to authenticated;

