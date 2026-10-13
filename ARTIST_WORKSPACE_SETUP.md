# Client and artist workspaces

The app at `http://localhost:3000` now has two workspaces behind the existing
Google sign-in. The studio has one shared artist inbox, not a public marketplace.

## Activate the database

1. In your existing Supabase project's SQL Editor, run
   `supabase/002_client_artist.sql` in full. This preserves submitted projects,
   creates profiles, adds ownership/status/details fields, creates artist-only
   notes, and creates the private `brief-files` bucket.
2. Run `supabase/003_grant_artist.sql`. It is configured for
   **regalariojayveesevilla@gmail.com**. That account must have signed into the
   app with Google at least once. Other accounts are clients by default.
3. Run `supabase/004_registration.sql` to enable registration and artist
   applications. See `REGISTRATION_SETUP.md` for activation and review instructions.
4. Hard-refresh the app with Ctrl+Shift+R. Open
   `http://localhost:3000/#workspace`. Your account opens the Artist workspace.
   An existing client account opens My briefs; a new account completes registration.

These SQL scripts require the Supabase SQL Editor's database administrator role.
The browser publishable key cannot run them or grant artist privileges. No secret
keys are needed in app files.

## What you can do

- Artists: search/filter/paginate all submissions, read briefs and client contact
  details, preview/download references, change status, and save private notes.
- Clients: submit briefs, see only their own records and references, and check
  the status the studio has set. Clients cannot read notes or change statuses.
- All signed-in accounts can create a brief, including an artist testing the flow.
- Status changes are available after refresh; this version does not send email
  notifications, subscribe to live updates, or include client feedback messaging.

## Existing data and privacy

- Earlier submissions are retained and shown to artists as **Earlier submission**.
  They have no client identity recorded. Do not guess an owner or assign all old
  projects to the first person who signs in. A database administrator may link a
  known record to a verified profile manually.
- New submissions use the authenticated session and record `client_id`. Private
  references live under that user's folder in `brief-files`; preview/download
  links expire after 10 minutes. Refresh a detail page for a fresh link.
- Old `project-images` files remain public, as before. This update stops new
  anonymous uploads but does not relocate existing files or break their URLs.
- Drafts remain local and are now separated by Google account. The earlier
  `makerflow-brief-v1` local draft is preserved in browser storage but not silently
  assigned to a different account. Submitted records are available through the
  artist inbox.
- All artist accounts share access to the studio inbox and notes. Role assignment
  is an administrator operation. Public sign-up creates an application only;
  approval is required before artist privileges are granted.

## Deploy

Deploy the complete `dist/` folder, including `workspace.js`, `workspace-data.js`,
`workspace.css`, and the updated `submissions.js`. `npm run web:build` continues to
bundle the Supabase client; no framework change is needed. Do not deploy test
fixtures or the `originals` staging backups.

## Verification

- The migration and row-level policies were exercised with a local PostgreSQL
  engine, including clients attempting to read others' briefs, promote their
  role, edit statuses, spoof ownership, or read/write studio notes and references.
- Isolated browser tests covered artist/client routing, inbox search and filters,
  details, status updates, notes, downloads, private uploads, failure/retry,
  receipt/tracking links, mobile layout, missing schema, and clearing data on sign-out.
- These checks do not apply the migration to your hosted Supabase database.
  After running the setup scripts, test with your artist account and a second
  Google account as the client.

Security references used:
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/storage/buckets/fundamentals
