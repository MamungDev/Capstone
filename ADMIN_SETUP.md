# Administrator access

Administrator access is separate from client and artist sign-in. Only Gmail addresses listed in `ADMIN_ALLOWED_EMAILS` can enroll, receive an invitation, or keep an active admin session. The local ignored configuration currently allows `reglariojayveesevilla@gmail.com`. Google sign-in by itself never grants administrator access.

## First administrator on local XAMPP

1. In the ignored `auth/config.local.php`, set `admin_password` to a private setup key with at least 16 characters. This is a one-time site-owner key for first setup and owner recovery; it is not the administrator's sign-in password.
2. Leave the `admin_allowed_emails` list restricted to the intended Gmail address. Do not commit `auth/config.local.php`.
3. Open `http://localhost/Capstone/Admin/setup.php`, select the allowed account, enter a display name, the site setup key, and a new admin password of at least 12 characters.
4. Add the displayed authenticator key to an authenticator app as a time-based account with 6 digits and a 30-second interval. Enter the current code to finish enrollment.
5. Save the one-time recovery codes somewhere private. They are hashed in the database and cannot be displayed again. Sign in from the site's Admin link with the Gmail address, admin password, and an authenticator or unused recovery code.

The setup key must be configured before first enrollment. The application will not create a default admin password or open an unprotected admin account.

## Production environment

Set these sensitive or restricted variables in the hosting environment, then deploy:

| Variable | Purpose |
| --- | --- |
| `ADMIN_PASSWORD` | Private site-owner setup and command-line recovery key, at least 16 characters |
| `ADMIN_ALLOWED_EMAILS` | Comma-separated exact Gmail allowlist; currently `reglariojayveesevilla@gmail.com` |
| `ADMIN_MFA_KEY` | Stable random encryption key, at least 32 characters, used to encrypt authenticator secrets |

Keep `ADMIN_MFA_KEY` stable. Changing it makes stored authenticator keys unreadable until they are reset. If it is omitted, the application derives the encryption key from `ADMIN_PASSWORD`; changing that value also requires an authenticator reset. Configure the allowlist in production as well as locally. The local file does not transfer to the host.

## Recovery and controls

A recovery code is a one-time backup for a lost authenticator. It still requires the administrator's password. If both the authenticator and unused recovery codes are lost, the site owner can reset that allowed admin from the server's command line:

```text
php auth/admin-recover.php reglariojayveesevilla@gmail.com
```

The command asks for `ADMIN_PASSWORD`, rotates the authenticator secret and recovery codes, and signs out existing admin sessions. Run it only on a trusted server terminal; the new authenticator key and codes are printed once.

Admins can manage users, suspend accounts and revoke their sessions, edit profiles, issue a one-time password-reset link, manage submitted projects and references, and invite or disable other allowlisted admins. Sensitive actions require the current admin password and a reason. Administrative changes and private reference views are recorded in the audit log. A reset link expires after 30 minutes, works once, and is not emailed automatically; share it privately with the verified account owner.
