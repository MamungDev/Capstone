# Administrator access

Administrators sign in with Google only. There is no separate admin password, authenticator enrollment, setup key, or recovery code. Only Google accounts authorized by the server allowlist or an owner-approved invitation can enter the workspace. Client and artist sign-in never grants administrator access.

## Local XAMPP

1. Configure `google_client_id`, `google_client_secret`, and `google_redirect_uri` in the ignored `auth/config.local.php`, as described in [AUTH_SETUP.md](AUTH_SETUP.md). Admins use the same Google OAuth client and callback as other Google sign-ins.
2. Keep `regalariojayveesevilla@gmail.com` in `admin_allowed_emails` as the owner. Existing allowlist entries remain preapproved. Add new Gmail administrators through the invitation workflow below.
3. Open the site's Admin link, select **Continue with Google**, and choose an approved account. Its administrator record is created automatically on its first verified Google sign-in.

## Hosted environment

Configure `ADMIN_ALLOWED_EMAILS` as a comma-separated list of approved Google account emails, plus `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, and the database variables. Redeploy after changing hosted environment variables. Local configuration does not transfer to the host.

`ADMIN_PASSWORD` and `ADMIN_MFA_KEY` are no longer used and may be removed from local and hosted configuration.

## Existing installations and controls

Existing administrators keep their IDs, names, active/disabled status, and audit history. On the first Google sign-in, the application upgrades the admin table and binds the approved email to Google's stable account ID. Retired password, authenticator, and recovery columns are removed. Old admin sessions cannot access the workspace; sign in with Google again. Old setup links lead to the Google sign-in screen.

Removing an allowlist-only email revokes access on the next request. Invitation access is controlled by its approval status; a pending, rejected, or revoked request does not grant access, even if its email is later added to the server allowlist. Disabled administrators stay disabled and cannot regain access by signing in again. A different Google account cannot replace an already linked account merely by presenting the same email. Sessions expire after one hour, and signing out requires another Google sign-in.

Only the owner can enable or disable administrators in the workspace. The owner cannot disable their own account. Management actions retain CSRF protection, reasons, deletion confirmations, and audit logging. They no longer ask for an admin password. User password-reset links still expire after 30 minutes, work once, and are not emailed automatically.

## Invite and approve administrators

1. Any signed-in administrator opens **Admin access**, enters a Gmail address and a reason, and selects **Submit invitation for approval**. Owner-submitted invitations also start as pending.
2. Only **regalariojayveesevilla@gmail.com**, signed in through Google as an active administrator, can approve or reject requests. This owner identity is fixed in the server code, not accepted from form fields. The owner must remain on the server allowlist.
3. The owner reviews the requester and reason, enters a review reason, and selects **Approve invitation** or **Reject invitation**. Pending and rejected invitees cannot enter the workspace.
4. After approval, copy the **Admin sign-in link** and share it with the invitee. No invitation email is sent automatically. The invitee signs in using the exact approved Gmail account; an admin record is created at first sign-in. This does not require a Vercel environment-variable change or a redeployment for each invite.
5. The owner can revoke an approved invitation before or after the invitee signs in. Revocation disables that admin account and invalidates existing sessions. A revoked invitation can be submitted again, but access stays blocked until the owner approves the new request. Approved admins may also be disabled and enabled by the owner without changing their invitation.

The application creates the additive `admin_access_requests` table automatically for MySQL and PostgreSQL on deployment's first database schema check. Database credentials need CREATE TABLE permission; otherwise import the updated schema before deploying. Existing admin records and server allowlist grants are preserved. All requests and review decisions are recorded in Activity. Stale or repeated decisions are rejected.
