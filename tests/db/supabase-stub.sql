-- Minimal stand-in for the Supabase platform schema and the pre-existing LOGOVA
-- tables, so migrations can be executed and tested locally with PGlite.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create schema storage;
grant usage on schema public, auth, storage to anon, authenticated;
create table auth.users(
 id uuid primary key default gen_random_uuid(), email text, email_confirmed_at timestamptz,
 is_anonymous boolean not null default false, raw_app_meta_data jsonb default '{}'::jsonb,
 raw_user_meta_data jsonb default '{}'::jsonb, created_at timestamptz not null default now(), last_sign_in_at timestamptz
);
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true),''),'{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated;
create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
create function storage.extension(name text) returns text language sql immutable as $$ select reverse(split_part(reverse(name),'.',1)) $$;
alter table storage.objects enable row level security;

create type public.app_role as enum ('user','admin');
create table public.profiles(id uuid primary key references auth.users(id), full_name text, role public.app_role default 'user');
create table public.clients(id uuid primary key default gen_random_uuid(), owner_id uuid references auth.users(id), name text, email text, created_at timestamptz default now());
create table public.projects(id uuid primary key default gen_random_uuid(), owner_id uuid references auth.users(id), client_id uuid, name text, status text, created_at timestamptz default now());
create table public.brand_briefs(id uuid primary key default gen_random_uuid(), project_id uuid references public.projects(id), brief jsonb, created_at timestamptz default now());
create table public.logo_concepts(id uuid primary key default gen_random_uuid(), project_id uuid references public.projects(id), direction text, specification jsonb, svg_markup text, selected boolean, created_at timestamptz default now());
create table public.logo_versions(id uuid primary key default gen_random_uuid(), concept_id uuid references public.logo_concepts(id), canvas_state jsonb, svg_markup text, created_at timestamptz default now());
create table public.generation_jobs(id uuid primary key default gen_random_uuid(), owner_id uuid references auth.users(id), project_id uuid, status text, provider text, created_at timestamptz default now(), completed_at timestamptz);
create table public.usage_records(id uuid primary key default gen_random_uuid(), owner_id uuid, metric text, quantity int, created_at timestamptz default now());
create table public.audit_logs(id uuid primary key default gen_random_uuid(), actor_id uuid, action text, entity_type text, entity_id uuid, metadata jsonb, created_at timestamptz default now());
create function public.consume_logo_credit() returns boolean language sql as $$ select true $$;
create function public.consume_generation_credit(uuid) returns boolean language sql as $$ select true $$;
create function public.handle_new_user() returns trigger language plpgsql as $$ begin return new; end $$;
grant select, insert, update, delete on all tables in schema public to authenticated;
