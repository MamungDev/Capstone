# Mamungkun

Mamungkun turns a rough creative idea into a four-step brief. It supports
reference images, sketching, and drafts saved on the current device.

## Web app (primary)

Mamungkun is now set up primarily as a browser-based web app. It needs no
XAMPP, database server, or installer to run locally. From this folder, run:

```powershell
& "C:\Program Files\nodejs\npm.cmd" run web:dev
```

Then open [http://localhost:3000](http://localhost:3000). Keep the terminal
open while using the app; press `Ctrl+C` in that terminal to stop it.

For email confirmation and password recovery, Supabase must allow these redirect URLs:

```text
http://localhost:3000/?auth=confirm
http://localhost:3000/?auth=recovery
```

To make the app public, deploy the `dist/` folder to a static host such as
GitHub Pages, Netlify, or Cloudflare Pages. Add the final public address plus
`/?auth=confirm` and `/?auth=recovery` to Supabase's Redirect URLs before testing
sign-in there. See [EMAIL_AUTH_SETUP.md](EMAIL_AUTH_SETUP.md) for setup and the
requested account/submission reset.

## Optional Windows installer

The desktop app is built with Tauri. It does not need an app store or a web
server after installation.

On a Windows build computer, install [Rust](https://rustup.rs/) and the
[Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
with the **Desktop development with C++** workload. Then, from this folder:

```powershell
& "C:\Program Files\nodejs\npm.cmd" install
& "C:\Program Files\nodejs\npm.cmd" run desktop:build
```

The setup executable appears in `src-tauri/target/release/bundle/nsis/`.
The installer can be shared as a direct download, for example in a GitHub
Release. It has not been code signed; Windows may show a reputation warning
until a signed release has established trust.

If your PC lacks the C++ build tools, GitHub Actions builds the same installer
after a push to `main`. Open **Actions > Windows installer > latest run**,
then download the `Mamungkun-Windows-Setup` artifact. Unzip it to get the
`-setup.exe` installer. You can also run the workflow manually.

For development, run `npm run desktop:dev`. Desktop sign-in requires the
Supabase callback URL in `AUTH_SETUP.md`.

## Registration and artist access

See [REGISTRATION_SETUP.md](REGISTRATION_SETUP.md) to activate client registration
and owner-reviewed artist applications. Existing accounts keep their roles; new
users choose Client or Artist and register with their email and password. Run the
`supabase/004_registration.sql` migration before using the updated app.

## Project layout

- `dist/`: application HTML, styles, and JavaScript
- `src/`: Supabase client entry, bundled into `dist/`
- `src-tauri/`: optional desktop wrapper and Windows installer setup
- `tests/`: interaction checks
- `EMAIL_AUTH_SETUP.md`: email/password sign-in and Supabase setup
