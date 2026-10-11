# Mamungkun

Mamungkun turns a rough creative idea into a four-step brief. It supports
reference images, sketching, and drafts saved on the current device.

## Windows installer

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

## Browser preview

Run `npm run bundle:auth`, then serve `dist/` on port 3000. The browser
version continues to use `http://localhost:3000/?auth=callback` for Google
sign-in.

## Project layout

- `dist/`: application HTML, styles, and JavaScript
- `src/`: Supabase client entry, bundled into `dist/`
- `src-tauri/`: desktop wrapper, OAuth callback, and Windows installer setup
- `tests/`: interaction checks
- `AUTH_SETUP.md`: Google and Supabase setup
