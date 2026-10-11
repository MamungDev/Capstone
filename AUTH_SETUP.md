# Mamungkun Google sign-in

Mamungkun uses Google as the identity provider and Supabase to manage the
session. The Google client secret belongs only in the Supabase dashboard. The
app contains a Supabase Project URL and a **publishable** key.

## Supabase and Google

1. In Google Cloud, create an OAuth **Web application** client. Its authorized
   redirect URI is the Supabase Google callback URL shown in Supabase, normally
   `https://dpuhmlbfxakbqmpzbfsb.supabase.co/auth/v1/callback`.
2. In Supabase **Authentication > Sign In / Providers > Google**, enable Google,
   enter the Google Client ID and Client Secret, then save.
3. In Supabase **Authentication > URL Configuration**, add both redirect URLs:
   - `http://localhost:3000/?auth=callback` for browser preview
   - `http://127.0.0.1:18765/?auth=callback` for the Windows desktop app
4. Add `http://localhost:3000` to Google's authorized JavaScript origins if
   you also use the browser preview. Google's redirect URI remains the
   Supabase callback, even for the desktop installer.
5. If Google's OAuth app is in Testing mode, add the Google accounts you will
   test with under **Audience > Test users**.
6. Use the Supabase Project URL and `sb_publishable_...` key in
   `dist/auth-config.js`. Never add `sb_secret_...`, a service-role key, or
   the Google Client Secret to the app or Git.

The desktop app opens Google's sign-in page in the default browser. A temporary
callback server on `127.0.0.1:18765` receives Supabase's code and the app
finishes the PKCE exchange. If another program is using that port, sign-in
cannot start; close the other program and try again.

The app needs an internet connection for sign-in. Briefs and images still live
only on the current device; Google sign-in does not sync them across devices.

Supabase reference:
https://supabase.com/docs/guides/auth/social-login/auth-google
