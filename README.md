# Capstone
Mamungkun: client creative briefs, private artist workspaces, and account management.

See [AUTH_SETUP.md](AUTH_SETUP.md) for local setup and deployment configuration.

Run the project checks from this folder:

```powershell
node tests/run.cjs
```

Requires Node.js with built-in `fetch` and `WebSocket`, local XAMPP MySQL running, and a configured `auth/config.local.php` whose database user can create temporary databases. Apache is not required: the runner starts its own PHP server. PHP defaults to `C:/xampp/php/php.exe` and the sketchpad browser defaults to Microsoft Edge; override with `PHP_BINARY` and `CHROMIUM_BINARY` environment variables if needed.

The runner checks PHP/JavaScript syntax and runs Google identity/redirect, onboarding, admin, reference upload, brief submission/artist workspace, privacy, project workflow, MySQL session, sketchpad, and loading screen suites. It uses temporary databases and cleans them up on normal completion, including test failures. Any failed check returns a nonzero exit code. An interrupted process may leave a temporary test database behind.

These are local MySQL checks. Live Google sign-in, PostgreSQL, and deployed-site behavior still need separate verification.
