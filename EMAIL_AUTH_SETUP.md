# Email and password accounts

The modal now offers Artist / Client, followed by email and password sign-in.
Create account opens name, email, password, and confirm-password fields. Google
is no longer used by the app. Passwords go directly to Supabase Auth; the app does
not save them in profiles, browser storage, or application tables.

## Supabase settings

1. Enable the **Email** authentication provider in your Supabase project.
2. In Auth URL configuration, set your web app's Site URL and allow:
   - `http://localhost:3000/?auth=confirm`
   - `http://localhost:3000/?auth=recovery`
   Add equivalent URLs for your deployed app before deployment.
3. With **Confirm email** enabled, signup displays a check-your-inbox screen.
   Configure an email sender/SMTP suitable for delivery to your users. Supabase's
   default mail service has restrictions and is intended for limited testing.
   For local prototype testing, you can turn off Confirm email; signup then
   opens registration immediately. Re-enable verification before a public launch.
4. Forgot password sends a reset link and opens the new-password form. This
   requires working email delivery even if signup confirmation is disabled.

The browser handles Supabase email callback tokens and removes them from the
address bar immediately. Confirmation on a different device still recognizes the
chosen signup type through profile metadata. That metadata is only a form default;
artist access is still determined by the protected database role after approval.

After signup/confirmation, new users complete their profile. Clients enter My
briefs. Artists submit an application and wait for owner approval. A returning
account can sign in with the same email/password. Old Google-only accounts that
have not been deleted can use Forgot password to set a password for their email.

For the optional desktop wrapper, configure a reachable web Site URL in Supabase
for confirmation/recovery emails. Password sign-in runs in the desktop app; email
links open the web app. Google desktop OAuth is no longer used.

## Full reset: accounts AND submissions

Use `supabase/reset_accounts_and_submissions.sql` instead of the older
`reset_all_accounts.sql`, which deliberately preserves submissions.

This deletes all app accounts (including the owner), profiles, applications,
submitted briefs, and private studio notes. Deleted database data requires a
backup to restore. Removing reference files through Storage is permanent.
It does not delete your actual email or Google accounts.

1. In this project's Supabase **Storage**, empty **brief-files** and
   **project-images**. Keep the buckets themselves so new uploads can work.
   Remove their files through the dashboard/Storage API, never by deleting
   `storage.objects` rows in SQL. The reset SQL stops if files are still present.
2. Run the entire `supabase/reset_accounts_and_submissions.sql` in SQL Editor.
   It reports the counts removed. If SQL fails, that SQL transaction rolls back;
   any files you already removed from Storage cannot be rolled back with it.
3. Sign out and hard-refresh `http://localhost:3000` (Ctrl+Shift+R).
4. Choose Artist > Create an artist account. Register with
   `regalariojayveesevilla@gmail.com` and a password, confirm email if enabled,
   and submit the artist application.
5. Restore your studio access by running:

```sql
select private.review_artist_application(p.id,'approved','Welcome to the studio!')
from public.profiles p
join public.artist_applications a on a.user_id=p.id
where lower(p.email)='regalariojayveesevilla@gmail.com'
  and a.status='pending';
```

6. Click Check application status in the app. New clients can register normally.

Old local drafts are per-account and are not assigned to newly created accounts.
No live account/submission deletion is performed merely by updating app files.

## Verification

Local browser checks use mocked Supabase responses for signup, login, email
confirmation, password recovery, and role routing. SQL tests use local PostgreSQL
with mock Supabase schemas. These checks do not send real emails or mutate the
hosted database. Test delivery with your configured sender after setup.

References: [Password auth](https://supabase.com/docs/guides/auth/passwords),
[file deletion](https://supabase.com/docs/guides/storage/management/delete-objects).
