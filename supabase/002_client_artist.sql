-- Run once (or rerun safely) in the Supabase SQL Editor as postgres.
-- Preserves existing projects. Old anonymous projects remain unassigned and
-- visible only to artists; there is no reliable client identity to backfill.
begin;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  email text,
  role text not null default 'client' check (role in ('client', 'artist')),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;

-- Never trust user-editable auth metadata for permissions.
create or replace function private.sync_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), new.email)
  on conflict (id) do update
    set display_name = excluded.display_name, email = excluded.email;
  return new;
end;
$$;
revoke all on function private.sync_profile() from public, anon, authenticated;
drop trigger if exists mamungkun_sync_profile on auth.users;
create trigger mamungkun_sync_profile after insert or update of email, raw_user_meta_data
  on auth.users for each row execute function private.sync_profile();

insert into public.profiles (id, display_name, email)
select id, coalesce(raw_user_meta_data->>'full_name', ''), email from auth.users
on conflict (id) do update set display_name = excluded.display_name, email = excluded.email;

create or replace function private.is_artist()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'artist');
$$;
revoke all on function private.is_artist() from public, anon, authenticated;
grant execute on function private.is_artist() to authenticated;

drop policy if exists "Read own profile or studio clients" on public.profiles;
create policy "Read own profile or studio clients" on public.profiles
  for select to authenticated using (id = (select auth.uid()) or (select private.is_artist()));

alter table public.projects
  add column if not exists client_id uuid references public.profiles(id) on delete set null,
  add column if not exists status text not null default 'new'
    check (status in ('new', 'reviewing', 'in_progress', 'ready_for_review', 'completed')),
  add column if not exists brief_details jsonb not null default '{}'::jsonb
    check (jsonb_typeof(brief_details) = 'object' and octet_length(brief_details::text) <= 20000),
  add column if not exists image_path text,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists projects_client_created_idx on public.projects(client_id, created_at desc);
create index if not exists projects_status_created_idx on public.projects(status, created_at desc);
alter table public.projects enable row level security;
revoke all on public.projects from public, anon, authenticated;
grant select on public.projects to authenticated;
grant insert (id, name, description, mode, client_id, brief_details, image_path) on public.projects to authenticated;
grant update (status) on public.projects to authenticated;

drop policy if exists "Anyone can submit a project" on public.projects;
drop policy if exists "Read permitted projects" on public.projects;
drop policy if exists "Submit own project" on public.projects;
drop policy if exists "Artists change project status" on public.projects;
create policy "Read permitted projects" on public.projects for select to authenticated
  using (client_id = (select auth.uid()) or (select private.is_artist()));
create policy "Submit own project" on public.projects for insert to authenticated
  with check (
    client_id = (select auth.uid()) and status = 'new'
    and (image_path is null or (
      split_part(image_path, '/', 1) = (select auth.uid())::text
      and exists (select 1 from storage.objects where bucket_id = 'brief-files' and name = image_path)
    ))
  );
create policy "Artists change project status" on public.projects for update to authenticated
  using ((select private.is_artist())) with check ((select private.is_artist()));

create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
revoke all on function private.touch_updated_at() from public, anon, authenticated;
drop trigger if exists mamungkun_project_updated on public.projects;
create trigger mamungkun_project_updated before update on public.projects
  for each row execute function private.touch_updated_at();

create table if not exists public.artist_notes (
  project_id uuid primary key references public.projects(id) on delete cascade,
  body text not null default '' check (char_length(body) <= 10000),
  author_id uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.artist_notes enable row level security;
revoke all on public.artist_notes from public, anon, authenticated;
grant select on public.artist_notes to authenticated;
grant insert (project_id, body, author_id), update (body, author_id) on public.artist_notes to authenticated;
drop policy if exists "Artists read notes" on public.artist_notes;
drop policy if exists "Artists add notes" on public.artist_notes;
drop policy if exists "Artists edit notes" on public.artist_notes;
create policy "Artists read notes" on public.artist_notes for select to authenticated
  using ((select private.is_artist()));
create policy "Artists add notes" on public.artist_notes for insert to authenticated
  with check ((select private.is_artist()) and author_id = (select auth.uid()));
create policy "Artists edit notes" on public.artist_notes for update to authenticated
  using ((select private.is_artist()))
  with check ((select private.is_artist()) and author_id = (select auth.uid()));
drop trigger if exists mamungkun_note_updated on public.artist_notes;
create trigger mamungkun_note_updated before update on public.artist_notes
  for each row execute function private.touch_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('brief-files', 'brief-files', false, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Stop new anonymous uploads. Existing public project-images links are preserved.
drop policy if exists "Anyone can upload project images" on storage.objects;
drop policy if exists "Upload own brief file" on storage.objects;
drop policy if exists "Read own or studio brief file" on storage.objects;
create policy "Upload own brief file" on storage.objects for insert to authenticated
  with check (bucket_id = 'brief-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Read own or studio brief file" on storage.objects for select to authenticated
  using (bucket_id = 'brief-files' and (
    (storage.foldername(name))[1] = (select auth.uid())::text or (select private.is_artist())
  ));

notify pgrst, 'reload schema';
commit;
