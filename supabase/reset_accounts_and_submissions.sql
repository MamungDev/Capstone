-- DESTRUCTIVE, MANUAL PROTOTYPE RESET. Not an application migration.
-- Intended project: dpuhmlbfxakbqmpzbfsb (Mamungkun).
-- Deletes ALL app users, profiles, artist applications, projects, and studio notes.
-- This includes the owner's account. Recovering deleted records requires a backup.
-- FIRST empty the brief-files and project-images buckets through Supabase Storage.
-- Keep the bucket containers. SQL must not delete storage.objects metadata.
-- After reset: refresh, create your artist account with email/password, submit
-- the application, then approve the owner using EMAIL_AUTH_SETUP.md.
begin;
lock table auth.users in share row exclusive mode;
lock table public.projects, public.artist_notes in share row exclusive mode;

do $$
begin
  if exists(select 1 from storage.objects where bucket_id in ('brief-files','project-images')) then
    raise exception 'Empty brief-files and project-images through Supabase Storage first, keeping the buckets. No account or submission data has been deleted.';
  end if;
end;
$$;

create temporary table full_reset_counts on commit drop as
select (select count(*) from auth.users) as accounts,
       (select count(*) from public.projects) as submissions,
       (select count(*) from public.artist_notes) as notes,
       (select count(*) from public.artist_applications) as applications;

-- Require a current profile, so deleted accounts cannot use old access tokens
-- to access any newly uploaded private files.
drop policy if exists "Active account required for brief files" on storage.objects;
create policy "Active account required for brief files" on storage.objects as restrictive
  for all to authenticated
  using (bucket_id <> 'brief-files' or (select private.is_registered()))
  with check (bucket_id <> 'brief-files' or (select private.is_registered()));

delete from public.artist_notes;
delete from public.projects;
delete from public.artist_applications;

-- Remove account ownership from the two retained, empty bucket containers.
do $$
declare ownership_column text;
begin
  foreach ownership_column in array array['owner','owner_id'] loop
    if exists(select 1 from information_schema.columns where table_schema='storage'
      and table_name='buckets' and column_name=ownership_column) then
      execute format('update storage.buckets set %I=null where id in (''brief-files'',''project-images'')',ownership_column);
    end if;
  end loop;
  if to_regclass('auth.refresh_tokens') is not null then
    execute 'delete from auth.refresh_tokens where user_id::text in (select id::text from auth.users)';
  end if;
end;
$$;
delete from auth.users;

do $$
begin
  if exists(select 1 from auth.users) or exists(select 1 from public.profiles)
    or exists(select 1 from public.projects) or exists(select 1 from public.artist_notes)
    or exists(select 1 from public.artist_applications) then
    raise exception 'Reset incomplete. All SQL changes rolled back.';
  end if;
end;
$$;
select accounts as deleted_accounts,submissions as deleted_submissions,
  notes as deleted_notes,applications as deleted_applications from full_reset_counts;
commit;
