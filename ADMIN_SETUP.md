# Administrator access

Administrators sign in with Google only. There is no separate admin password, authenticator enrollment, setup key, or recovery code. Only exact email addresses on the server's administrator allowlist can enter the workspace. Client and artist sign-in never grants administrator access.

## Local XAMPP

1. Configure `google_client_id`, `google_client_secret`, and `google_redirect_uri` in the ignored `auth/config.local.php`, as described in [AUTH_SETUP.md](AUTH_SETUP.md). Admins use the same Google OAuth client and callback as other Google sign-ins.
2. Set `admin_allowed_emails` to the intended administrators' Google account emails. Gmail and Google Workspace accounts are supported. Keep this list restricted; every listed account can become a full administrator.
3. Open the site's Admin link, select **Continue with Google**, and choose an approved account. Its administrator record is created automatically on its first verified Google sign-in.

## Hosted environment

Configure `ADMIN_ALLOWED_EMAILS` as a comma-separated list of approved Google account emails, plus `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, and the database variables. Redeploy after changing hosted environment variables. Local configuration does not transfer to the host.

`ADMIN_PASSWORD` and `ADMIN_MFA_KEY` are no longer used and may be removed from local and hosted configuration.

## Existing installations and controls

Existing administrators keep their IDs, names, active/disabled status, and audit history. On the first Google sign-in, the application upgrades the admin table and binds the approved email to Google's stable account ID. Retired password, authenticator, and recovery columns are removed. Old admin sessions cannot access the workspace; sign in with Google again. Old setup links lead to the Google sign-in screen.

Removing an email from the allowlist revokes access on the next request. Disabled administrators stay disabled and cannot regain access by signing in again. A different Google account cannot replace an already linked account merely by presenting the same email. Sessions expire after one hour, and signing out requires another Google sign-in.

The site owner adds approved administrators through the allowlist. Administrators can enable or disable existing administrators in the workspace, except themselves. Management actions retain CSRF protection, reasons, deletion confirmations, and audit logging. They no longer ask for an admin password. User password-reset links still expire after 30 minutes, work once, and are not emailed automatically.
