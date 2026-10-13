-- DESTRUCTIVE ONE-TIME OPERATION, not an application migration.
-- Run only in Mamungkun's Supabase project: dpuhmlbfxakbqmpzbfsb.
-- Deletes ALL Auth users (including the owner), profiles, artist applications,
-- and their Auth sessions/identities. A database backup is needed to undo it.
-- Keeps submitted briefs, studio notes, and uploaded files. Their former account
-- links are removed. Recreated accounts get NEW IDs and do not reclaim old briefs.
-- Afterward, sign out/refresh the app, register again, and reapprove the owner.
begin;

lock table auth.users in share row exclusive mode;
create temporary table reset_account_ids on commit drop as select id from auth.users;
create temporary table reset_account_counts on commit drop as
select (select count(*) from auth.users) as users_before,
       (select count(*) from public.projects) as briefs_before,
       (select count(*) from public.artist_notes) as notes_before,
       (select count(*) from storage.objects) as files_before;

-- An old access token may survive account deletion until its expiry. Require a
-- current registered profile to access private brief files as well as their path.
drop policy if exists "Active account required for brief files" on storage.objects;
create policy "Active account required for brief files" on storage.objects as restrictive
  for all to authenticated
  using (bucket_id <> 'brief-files' or (select private.is_registered()))
  with check (bucket_id <> 'brief-files' or (select private.is_registered()));

-- Preserve note content; authors no longer exist after the reset.
alter table public.artist_notes alter column author_id drop not null;
update public.artist_notes set author_id=null
where author_id in (select id from reset_account_ids);

-- Detach retained briefs from deleted profiles; do not guess future ownership.
update public.projects set client_id=null
where client_id in (select id from reset_account_ids);

-- Storage retains file records and file contents. Clear obsolete user ownership
-- so its ownership constraint does not block Auth deletion. Supabase versions
-- may have the deprecated UUID owner, text owner_id, or both.
do $$
declare storage_table text; ownership_column text;
begin
  foreach storage_table in array array['objects','buckets'] loop
    foreach ownership_column in array array['owner','owner_id'] loop
      if exists (select 1 from information_schema.columns
        where table_schema='storage' and table_name=storage_table and column_name=ownership_column) then
        execute format('update storage.%I set %I=null where %I::text in (select id::text from reset_account_ids)',
          storage_table, ownership_column, ownership_column);
      end if;
    end loop;
  end loop;
end;
$$;

-- Remove refresh tokens explicitly for compatibility with older Auth schemas.
do $$
begin
  if to_regclass('auth.refresh_tokens') is not null then
    execute 'delete from auth.refresh_tokens where user_id::text in (select id::text from reset_account_ids)';
  end if;
end;
$$;
delete from auth.users where id in (select id from reset_account_ids);

-- Abort the whole transaction if a different deployed FK unexpectedly removed
-- retained content, or if account removal was incomplete.
do $$
declare before_reset record;
begin
  select * into before_reset from reset_account_counts;
  if exists(select 1 from auth.users) or exists(select 1 from public.profiles)
    or exists(select 1 from public.artist_applications) then
    raise exception 'Account reset incomplete. All changes rolled back.';
  end if;
  if (select count(*) from public.projects) <> before_reset.briefs_before
    or (select count(*) from public.artist_notes) <> before_reset.notes_before
    or (select count(*) from storage.objects) <> before_reset.files_before then
    raise exception 'Content retention check failed. All changes rolled back.';
  end if;
end;
$$;

select users_before as deleted_accounts, briefs_before as retained_briefs,
  notes_before as retained_notes, files_before as retained_files
from reset_account_counts;
commit;
