-- Run after 002_client_artist.sql, in the Supabase SQL Editor as postgres.
-- Existing accounts keep their roles/access. New accounts must finish registration.
begin;

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema='public'
    and table_name='profiles' and column_name='onboarded_at') then
    alter table public.profiles add column onboarded_at timestamptz;
    update public.profiles set onboarded_at = now();
  end if;
end;
$$;

create table if not exists public.artist_applications (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  portfolio_url text check (portfolio_url is null or
    (char_length(portfolio_url) <= 2000 and portfolio_url ~ '^https?://[^[:space:]/]+')),
  introduction text not null default '' check (char_length(introduction) <= 2000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  review_message text not null default '' check (char_length(review_message) <= 2000),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz
);
alter table public.artist_applications enable row level security;
revoke all on public.artist_applications from public, anon, authenticated;
grant select on public.artist_applications to authenticated;
drop policy if exists "Read own artist application" on public.artist_applications;
create policy "Read own artist application" on public.artist_applications
  for select to authenticated using (user_id = (select auth.uid()));

-- OAuth profile refreshes must not overwrite the name chosen during registration.
create or replace function private.sync_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), new.email)
  on conflict (id) do update set email = excluded.email,
    display_name = case when public.profiles.onboarded_at is null
      then excluded.display_name else public.profiles.display_name end;
  return new;
end;
$$;
revoke all on function private.sync_profile() from public, anon, authenticated;

-- One atomic registration; no user-supplied identity, role or approval fields.
create or replace function public.complete_registration(
  p_display_name text, p_account_type text,
  p_portfolio_url text default null, p_introduction text default ''
) returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  account public.profiles%rowtype;
  application_status text;
  chosen_name text := btrim(coalesce(p_display_name,''));
  portfolio text := nullif(btrim(coalesce(p_portfolio_url,'')), '');
begin
  if uid is null then raise exception 'Please sign in to register.'; end if;
  if p_account_type is null or p_account_type not in ('client','artist') then
    raise exception 'Choose client or artist.';
  end if;
  if char_length(chosen_name) not between 1 and 100 then
    raise exception 'Enter a display name between 1 and 100 characters.';
  end if;
  if char_length(coalesce(p_introduction,'')) > 2000 then
    raise exception 'Keep your introduction under 2,000 characters.';
  end if;
  if portfolio is not null and (char_length(portfolio) > 2000 or portfolio !~ '^https?://[^[:space:]/]+') then
    raise exception 'Use a full http:// or https:// portfolio URL.';
  end if;
  select * into account from public.profiles where id=uid for update;
  if not found then raise exception 'Your profile is missing. Please contact the app owner.'; end if;
  -- Completed retries never change roles or overwrite a reviewed application.
  if account.role = 'artist' then
    if account.onboarded_at is null then
      update public.profiles set display_name=chosen_name,onboarded_at=now() where id=uid;
    end if;
    return;
  end if;
  if p_account_type = 'artist' then
    select status into application_status from public.artist_applications where user_id=uid;
    if application_status in ('pending','approved') then return; end if;
    insert into public.artist_applications(user_id, portfolio_url, introduction)
    values (uid, portfolio, btrim(coalesce(p_introduction,'')))
    on conflict (user_id) do update set portfolio_url=excluded.portfolio_url,
      introduction=excluded.introduction, status='pending', review_message='',
      submitted_at=now(), reviewed_at=null;
  elsif account.onboarded_at is not null then
    return;
  end if;
  update public.profiles set display_name=chosen_name,
    onboarded_at=coalesce(onboarded_at,now()) where id=uid;
end;
$$;
revoke all on function public.complete_registration(text,text,text,text) from public, anon, authenticated;
grant execute on function public.complete_registration(text,text,text,text) to authenticated;

-- SQL Editor only. Artist users do not gain administrator/approval permissions.
create or replace function private.review_artist_application(
  p_user_id uuid, p_decision text, p_message text default ''
) returns void language plpgsql security definer set search_path = '' as $$
declare current_status text;
begin
  if p_decision is null or p_decision not in ('approved','rejected') then
    raise exception 'Decision must be approved or rejected.';
  end if;
  if char_length(coalesce(p_message,'')) > 2000 then raise exception 'Review message is too long.'; end if;
  -- Match registration lock order to prevent concurrent review/resubmission races.
  perform 1 from public.profiles where id=p_user_id for update;
  select status into current_status from public.artist_applications where user_id=p_user_id for update;
  if not found then raise exception 'Artist application not found.'; end if;
  if current_status <> 'pending' then raise exception 'This application has already been reviewed.'; end if;
  update public.artist_applications set status=p_decision,
    review_message=coalesce(p_message,''), reviewed_at=now() where user_id=p_user_id;
  if p_decision='approved' then
    update public.profiles set role='artist' where id=p_user_id;
  end if;
end;
$$;
revoke all on function private.review_artist_application(uuid,text,text) from public, anon, authenticated;

create or replace function private.is_registered()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id=(select auth.uid()) and onboarded_at is not null);
$$;
revoke all on function private.is_registered() from public, anon, authenticated;
grant execute on function private.is_registered() to authenticated;

-- Restrictive policies supplement the existing ownership rules, including uploads.
drop policy if exists "Registration required for briefs" on public.projects;
create policy "Registration required for briefs" on public.projects as restrictive
  for insert to authenticated with check ((select private.is_registered()));
drop policy if exists "Registration required for brief uploads" on storage.objects;
create policy "Registration required for brief uploads" on storage.objects as restrictive
  for insert to authenticated with check (bucket_id <> 'brief-files' or (select private.is_registered()));

notify pgrst, 'reload schema';
commit;
