# Makerflow Google sign-in

The landing-page workspace links open a native sign-in dialog. Close it with
the X, Escape, the backdrop, or “Back to exploring”. Authenticated users go
straight to their workspace. The footer workspace link behaves the same way.

## Connect Google

1. Create or select your Supabase project.
2. In Google Cloud, configure the OAuth consent screen, then create an OAuth
   client of type Web application. Use the Supabase callback URL shown in its
   Google provider settings as Google's authorized redirect URI (normally
   `https://YOUR-PROJECT.supabase.co/auth/v1/callback`). Add your app origin
   (for example `http://localhost:3000`) as an authorized JavaScript origin.
3. Enable Google in Supabase Authentication providers. Store the Google client
   ID and client secret there. If Google's consent screen is in testing mode,
   add the accounts you will test with as test users.
4. Set Supabase Authentication's Site URL to your app's URL and allow the exact
   callback URL. For `npx serve dist` on port 3000, add
   `http://localhost:3000/?auth=callback`. If opening `/index.html`, also allow
   `http://localhost:3000/index.html?auth=callback`. Use the corresponding HTTPS
   URLs for a hosted website.
5. In `dist/auth-config.js`, enter the Supabase project URL and publishable key
   (a legacy anon key also works). Never put a service-role key, Supabase secret
   key, or Google client secret in browser files.
6. Run `npx serve dist`, open its localhost URL, and choose a workspace button.
   The modal works with a direct file URL, but OAuth needs HTTP/HTTPS.

The browser loads the pinned Supabase client only when configuration is present.
It uses PKCE and exchanges the returned code before opening the workspace.
Test successful login, cancellation, refresh, and sign-out using a test account.
Live OAuth cannot be tested until these project settings are supplied.

## Current data behavior

Briefs still live in the existing browser storage. Google sign-in does not sync
them or isolate local drafts between people using the same browser. Signing out
preserves the local draft. The UI gate is not server authorization; any future
cloud brief storage needs user ownership and database row-level security.

Official setup reference: https://supabase.com/docs/guides/auth/social-login/auth-google
