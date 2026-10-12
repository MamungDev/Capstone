-- Run AFTER 002_client_artist.sql. The artist must have signed in once first.
-- Your chosen Google account is set below. Only a database
-- administrator can run this; there is no client-accessible role-switch API.
  do $$
  declare artist_email text := 'regalariojayveesevilla@gmail.com';
  begin
    if not exists (select 1 from public.profiles where lower(email) = lower(artist_email)) then
      raise exception 'Account not found. Sign in with Google once, then enter its email in this script.';
    end if;
    update public.profiles set role = 'artist' where lower(email) = lower(artist_email);
  end;
  $$;

  select display_name, email, role from public.profiles
  where lower(email) = 'regalariojayveesevilla@gmail.com';
