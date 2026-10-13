# Authentication setup

Mamungkun now uses email and password for both clients and artists.
Google OAuth has been removed from the app's sign-in flow.

Follow [EMAIL_AUTH_SETUP.md](EMAIL_AUTH_SETUP.md) for Email provider settings,
confirmation and password recovery URLs, email delivery, and the requested
reset of accounts and submissions.

The public Supabase configuration remains in `dist/auth-config.js`.
Never put secret/service-role keys in the browser app.
