# Client registration and artist applications

## Email sign-in and project reset

See [EMAIL_AUTH_SETUP.md](EMAIL_AUTH_SETUP.md) for email/password signup, confirmation,
password recovery, and the full reset of accounts and submitted briefs. Google is
no longer used by the app. The auth modal offers Artist and Client first; each
opens email/password sign-in and account creation.

## Activate (existing project)

1. Open your Supabase project > SQL Editor. Run all of
   `supabase/004_registration.sql`. This assumes `002_client_artist.sql` was
   already applied. The existing owner account can keep its artist role from 003.
2. Hard-refresh `http://localhost:3000` with Ctrl+Shift+R.
3. Test with an email account that has **never signed in to this project before**.
   Existing accounts deliberately skip registration and keep their briefs/access.
   Existing clients can use **Artist application** in My briefs to apply later.

The migration is safe to rerun: it marks existing accounts registered only on its
first run, leaves new accounts incomplete, and never deletes briefs or resets roles.
Apply migrations in order; do not rerun 002 after 004, because 002 installs the old
profile-sync function. If you do, rerun 004 immediately afterwards.

## User experience

- Supabase Auth handles email/password sign-in and email verification.
- New users choose a display name and Client or Artist.
- Clients enter My briefs immediately.
- Artists may add a portfolio URL and introduction, then enter Pending review.
  They retain client-level access to their own briefs while waiting.
- Rejected applicants see the owner's message and can update/apply again.
- Approved artists enter the shared studio. Refresh the application status or
  reopen My workspace after an approval; no sign-out is needed.
- Existing approved artists, including the configured owner's account, skip signup.

## Review an application

Open `supabase/review_artist_application.sql` in the SQL Editor. Run its SELECT
to inspect the applicant, email, portfolio, introduction, and status. Copy the
applicant's `user_id`, then uncomment **one** review call and replace the placeholder.
Use `approved` or `rejected`. The optional message is visible to the applicant.

Use this review function instead of editing only the application's status in
Table Editor: approval updates both the application and the profile's role in
one transaction. Normal artist accounts cannot approve applications; review is
an owner/database-administrator operation. No admin key goes into browser code.

**Important:** this is one shared studio, not a marketplace with isolated artist
projects. Approving an artist grants access to all client briefs, contact details,
reference files, and studio notes. Approve trusted collaborators only.

View applications in Table Editor > `artist_applications`; names/emails and roles
are in `profiles`; briefs remain in `projects`. Portfolio and introduction fields
are stored only in the application, readable by that applicant and the database
administrator (not by every artist).

## Security and checks

- Database registration derives identity from the signed-in session, validates
  values, and never accepts a role or approval status from the browser.
- Direct profile/application writes are denied to users. Owner review runs only
  in the database; choosing Artist only creates a pending application.
- New unregistered accounts cannot bypass signup to insert briefs or upload files.
- Account metadata cannot grant artist access or mark registration complete.
- Display names chosen during registration survive subsequent sign-ins.
- Retrying registration does not duplicate applications or undo an approval.

Local checks (do not write to hosted Supabase):

```powershell
node tests/browser.cjs
# Optional PostgreSQL policy tests; install this test-only dependency if absent:
npm install --no-save --package-lock=false @electric-sql/pglite
node tests/registration-permissions.mjs
```

Browser tests use isolated headless Edge on Windows and mock API responses.
PostgreSQL tests execute the SQL and access rules in PGlite with mock Auth/Storage
tables. Neither replaces a final test against your hosted project after you run
the migration. Email delivery and the Tauri desktop wrapper were not retested live.

Deploy the entire `dist/` folder, including `registration.js` and
`registration.css`, after applying the migration. `npm run web:build` still bundles
only the shared Supabase SDK; it does not apply migrations.

This implementation follows Supabase's guidance on
[function privileges](https://supabase.com/docs/guides/database/functions) and
[row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security).
