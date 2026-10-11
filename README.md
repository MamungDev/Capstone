# Mamungkun

Mamungkun helps people turn a rough creative idea into a structured brief. It
includes a landing page, a four-step brief builder, visual-reference upload or
sketching, browser-local draft saving, and a Google sign-in modal ready for
Supabase configuration.

## Run locally

From the project folder in PowerShell:

```powershell
& "C:\Program Files\nodejs\npx.cmd" --yes serve dist
```

Open the local address shown in the terminal, normally `http://localhost:3000`.

## Google sign-in

The sign-in interface is included. To connect real Google authentication, add
your Supabase URL and publishable key to `dist/auth-config.js`, then follow
`AUTH_SETUP.md`. Never add a Supabase secret key, service-role key, or Google
client secret to browser files or Git.

## Project layout

- `dist/` — static application files
- `tests/` — interaction smoke checks
- `AUTH_SETUP.md` — Supabase and Google OAuth configuration steps
