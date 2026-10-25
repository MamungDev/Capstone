# Local account demo

This project uses the XAMPP MySQL server for registration. phpMyAdmin lets you inspect the `mamungkun_capstone` database and its `users` table; PHP connects to that database through PDO. The tables were created locally from [auth/schema.sql](auth/schema.sql). On another computer, first create/select a MySQL database, then import that SQL file into it.

Start **Apache** and **MySQL** in the XAMPP Control Panel, then open `http://localhost/Capstone/`. Choose **Client** or **Artist** in the auth modal. Create an account with a name, email, and password of at least eight characters. After registration, sign out and sign back in with the same role to demonstrate the separate paths. The `role` column in phpMyAdmin shows how the accounts are separated; `password_hash` contains a hash, not the entered password.

Client accounts enter `Client/Client UI.php`. Artist accounts enter `Artist/Artist UI.php`, a separate studio inbox based on the prototype's artist design. Each page checks the account role on the server. Client drafts remain in the browser for that account.

Clients can complete **Describe → Set direction → Add references → Review**, then select **Submit brief**. Submission saves a snapshot of the project details, keywords, and optional image or sketch to MySQL. A confirmation appears only after the server saves it. **View submitted brief** opens the saved snapshot; **My briefs** lists the signed-in client's submissions, including after signing out and back in. **Create another brief** starts a new draft without removing previous submissions. Retrying an unchanged submission does not create a duplicate.

The `client_briefs` table has already been created in the local `mamungkun_capstone` database. No manual phpMyAdmin setup is needed on this computer. On another installation, select the target database and import `auth/schema.sql`; it creates missing tables without deleting existing accounts. The `client_id` column links each brief to its owner, `details_json` contains the written brief, and `visual_data` stores image bytes. View images through **My briefs**, rather than the raw BLOB in phpMyAdmin. Uploads in the browser are limited to 2 MB to leave room for local draft storage; the server also validates image type, size, and dimensions.

Submitted briefs are viewable by their client and by signed-in artists. For this local team demo, every artist account can browse all submitted briefs. The artist inbox shows totals for briefs, visual references, and submitting clients. Artists can search project names, client names, or idea descriptions; filter by project type or attached reference; sort by submission date; and page through results. Select **View** to read the full brief and view or download its image or sketch. **Back to the inbox** preserves filters, sorting, and the current page. **Refresh** checks for new submissions.

To demonstrate the complete flow:

1. Sign in as a client, finish the four steps, and submit a brief with an optional reference or sketch.
2. Sign out, then sign in with a separate artist account through the auth modal.
3. Open the brief from the artist inbox and review the client's answers and reference. Use **Download reference** to save the attachment.
4. Sign back in as the client and open **My briefs** to view the same submission.

Client accounts cannot open the artist inbox or its reference endpoints. Clients can only view their own submissions through **My briefs**. Artist assignment, messaging, editable studio notes, and status tracking are not implemented yet. Google sign-in is available after the setup below.

To run the client and artist regression checks with Apache and MySQL running, use `node tests/brief-submission.cjs` from the project folder. It creates temporary accounts and briefs, checks persistence, access isolation, validation, images, sketches, retry handling, artist sign-in/sign-out, inbox search/filter/sort/pagination, and reference downloads, then deletes its test records. Existing accounts and briefs are preserved. The artist checks are in `tests/artist-workspace.cjs` and run as part of this command. These are HTTP/database checks; visual layout should also be reviewed in a browser at desktop and mobile widths.

The local database connection is configured in `auth/config.local.php`. That file is ignored by Git and denied direct HTTP access. If your XAMPP MySQL root password changes, update `db_password` there. Do not put the database credentials in `index.php` or JavaScript.

Google sign-in appears in the client and artist sign-in and registration screens when its credentials and callback URL are configured. Password recovery and verification emails for password accounts are not configured yet.

## Google sign-in

Google verifies identity through the PHP OAuth callback. Application accounts remain in the existing `users` table in Supabase PostgreSQL (or local MySQL). This flow does not use Supabase Auth, and does not need a Google provider configured in the Supabase dashboard. It requests only `openid email profile`, with no access to Gmail messages.

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create/select a project such as **Mamungkun**.
2. Open **Google Auth Platform → Get started**. Enter **Mamungkun** as the app name, your support/contact email, and choose **External** for the audience. If using Testing, add your intended Gmail accounts under **Audience → Test users**.
3. Open **Clients → Create client**, choose **Web application**, and name it **Mamungkun website**. Under **Authorized redirect URIs**, add this exact URL:

   ```text
   https://capstone-smoky-theta.vercel.app/auth/google-callback.php
   ```

   This is a server redirect flow; Authorized JavaScript origins are not required by this implementation. Use the stable production domain for sign-in, rather than individual deployment URLs.
4. Save the client ID and client secret privately. Add these **Production** variables in Vercel:

   | Variable | Value |
   | --- | --- |
   | `GOOGLE_CLIENT_ID` | Client ID from Google, ending in `.apps.googleusercontent.com` |
   | `GOOGLE_CLIENT_SECRET` | Client secret from Google; mark Sensitive |
   | `GOOGLE_REDIRECT_URI` | `https://capstone-smoky-theta.vercel.app/auth/google-callback.php` |

5. Push the code changes and deploy with those variables. Open the production homepage, choose **Client** or **Artist**, then **Continue with Google**. Google accounts that are new to this app are created in the chosen role. Existing Google accounts must sign in with their original role. The app does not grant admin access through Google.

Accounts already registered with a password must continue using their password. Matching emails are never automatically linked; linking an existing password account would require a separate authenticated flow. For the first Google login, use a Google account that has not already been registered with a password in this app.

The callback uses one-time session state, a nonce, PKCE, and signed Google ID token verification. Preview URLs redirect to the configured callback hostname before starting Google login so the callback receives the correct session cookie. Configure a separate Google client and callback for a separate testing deployment rather than mixing production and testing accounts.

For local development, use a separate Google web client with `http://localhost/Capstone/auth/google-callback.php` and set `google_client_id`, `google_client_secret`, and `google_redirect_uri` in the ignored `auth/config.local.php`. Keep credentials out of Git and chat.

Run `C:\xampp\php\php.exe tests/google-auth.php` for signed-token validation and isolated account/role checks (SQLite in memory), and `node tests/google-flow.cjs` for HTTP redirect, state, cancellation, and PKCE checks with dummy credentials. These do not contact Google or write to the app database. A real Google account login still needs to be checked after configuring the OAuth client.

Troubleshooting: `redirect_uri_mismatch` means the Google client's registered URI and `GOOGLE_REDIRECT_URI` must match exactly. An expired login can mean the flow started on another hostname or the session expired. If the Google button is missing, check all three Vercel variables and redeploy. Google auth changes do not send verification or password-recovery emails for password accounts.

References: [Google web server OAuth flow](https://developers.google.com/identity/protocols/oauth2/web-server), [OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect).

## Account manager

Open `/Admin/login.php` for the dedicated admin sign-in page. Successful sign-in opens `/Admin/index.php` to manage the accounts in the database used by that deployment. Signed-out visitors to the account manager are redirected to sign-in. The manager lists names, emails, roles, registration dates, and submitted brief counts, with search, role filters, and pagination. App client and artist passwords do not grant admin access.

To enable the live account manager:

1. Open **Vercel → Capstone → Settings → Environment Variables**.
2. Add `ADMIN_PASSWORD` with a unique password or passphrase of at least 16 characters. Mark it Sensitive and select the deployment environment you want to manage.
3. Redeploy, then open `https://capstone-smoky-theta.vercel.app/Admin/login.php` and enter that password. No admin email or Google account is required. If the password is missing or shorter than 16 characters, the sign-in page displays the specific setup issue and keeps sign-in disabled until you update the value and redeploy.

Keep the password in Vercel, not in GitHub or chat. Admin access is disabled when the password is missing or shorter than 16 characters. For XAMPP only, add an `admin_password` entry to the ignored `auth/config.local.php` and visit `http://localhost/Capstone/Admin/index.php`; that instance manages your local database, not Aiven.

Admin sign-in expires after at most one hour. Changing `ADMIN_PASSWORD` and redeploying invalidates existing admin sessions. Ten failed admin sign-in attempts lock admin sign-in for the remainder of a 15-minute window; the limit is shared across sessions. The `admin_login_limits` table is created automatically when needed.

Select **Delete** to review an account and its brief count, then type its exact email to confirm. Confirming permanently deletes that account and all its submitted briefs, including attached images and sketches. Other accounts are preserved. A deleted account loses access on its next request. The manager does not show password hashes or support account editing or password resets yet.

Run `node tests/admin-accounts.cjs` with XAMPP MySQL running to check admin authentication, access restrictions, CSRF, search/filter/pagination, deletion, shared login limits, and password rotation. This uses a temporary database and a local PHP server and cleans them up afterwards; existing accounts are not deleted. Set `PHP_BINARY` if PHP is installed somewhere other than `C:/xampp/php/php.exe`.

## Vercel deployment

Vercel runs this PHP project through the community `vercel-php` runtime configured in `vercel.json`. Import the GitHub repository `MamungDev/Capstone` in Vercel, leave the root directory as `.`, choose the **Other** framework preset, and leave the build command and output directory empty. The XAMPP database at `127.0.0.1` is only available on your computer; Vercel needs a hosted database such as Aiven MySQL or Supabase PostgreSQL.

### Supabase PostgreSQL

The app can use Supabase PostgreSQL while local XAMPP remains on MySQL. In Supabase, open **Connect → Direct → Transaction pooler** and use its host, port, and username. Vercel uses short-lived serverless connections, so choose the transaction pooler; its port is normally `6543`. The pooler does not support server-side prepared statements, so the PHP PostgreSQL connection uses emulated prepares.

Add these environment variables in **Vercel → Project → Settings → Environment Variables** for the environments you will deploy, then redeploy:

| Variable | Value |
| --- | --- |
| `DB_DRIVER` | `pgsql` |
| `DB_HOST` | Pooler host from the Supabase connection string |
| `DB_PORT` | Pooler port, normally `6543` |
| `DB_NAME` | `postgres` |
| `DB_USER` | Pooler username from the connection string, including the project reference |
| `DB_PASSWORD` | The database password you chose when creating the project |
| `DB_SSLMODE` | `require` |
| `SESSION_DRIVER` | `pgsql` |

Keep `DB_PASSWORD` sensitive and out of Git and chat. The app creates the PostgreSQL tables from `auth/schema.postgres.sql` on its first deployed request. Local XAMPP continues to use `auth/schema.sql` and does not need these Supabase environment variables. Existing MySQL accounts and briefs are not copied automatically; export/import them as a separate migration after the Supabase connection is confirmed.

### Aiven MySQL

1. In the Aiven MySQL service, use the existing `defaultdb` database shown under **Connection information**. Download its **CA certificate** (`ca.pem`). Keep the Aiven password out of project files and chat.
2. The deployed app creates missing `users`, `client_briefs`, `app_sessions`, and `admin_login_limits` tables from `auth/schema.sql` on its first request. The schema uses `CREATE TABLE IF NOT EXISTS`, preserving existing accounts and briefs. If your database user does not have permission to create tables, connect with a MySQL client using the service's **Host**, **Port**, **User**, password, and downloaded CA certificate, then import `auth/schema.sql` into `defaultdb` manually.
3. For a manual import from this Windows project folder with XAMPP's MySQL client, replace the host and CA path below with the exact values in Aiven's **Quick connect** panel. The `--password` option prompts you securely. Never paste a password directly into the command line.

   ```powershell
   Get-Content .\auth\schema.sql -Raw |
     & 'C:\xampp\mysql\bin\mysql.exe' --host=YOUR_AIVEN_HOST --port=13669 --user=avnadmin --password --ssl-ca='C:\path\to\ca.pem' --ssl-verify-server-cert defaultdb
   ```

4. In **Vercel → Project → Settings → Environment Variables**, set these values for Production and Preview. Mark the password as **Sensitive**. Paste the full CA certificate text, including its `BEGIN CERTIFICATE` and `END CERTIFICATE` lines, into `DB_SSL_CA_PEM`.

   | Variable | Value |
   | --- | --- |
   | `DB_HOST` | Aiven's Host, without `mysql://` or a port suffix |
   | `DB_PORT` | Aiven's Port, shown as `13669` in the example service |
   | `DB_NAME` | `defaultdb` |
   | `DB_USER` | Aiven's User, shown as `avnadmin` in the example service |
   | `DB_PASSWORD` | Aiven's Password, entered only in Vercel |
   | `DB_SSL_CA_PEM` | Complete Aiven CA certificate text |
   | `SESSION_DRIVER` | `mysql` |

5. Redeploy after setting the variables. A deployment keeps the environment values present when it was built. Test artist/client registration, sign-out/sign-in, brief submission, and image viewing on the deployed URL.

The PHP connection writes the CA certificate to the function's temporary directory and verifies the MySQL server certificate. If the CA is missing or invalid, the connection fails rather than silently using an unverified connection. `DB_SSL_CA` remains available as a local file path for local testing; Vercel requires `DB_SSL_CA_PEM`. The `app_sessions` table stores sign-in sessions across function instances. The session cookie uses `/` automatically on Vercel. Keep database credentials in Vercel environment variables; do not commit `auth/config.local.php`.

The Aiven database begins empty. Existing local XAMPP accounts and briefs do not move automatically. Aiven's free plan has different limits from a 30-day trial plan; check the service plan before the trial expires.

Clients can attach multiple images and sketches to one brief, select several files at once, and remove individual references before submitting. There is no application limit on the reference count; each image must be 2 MB or smaller. Browser draft capacity still depends on the device's available storage.

Drafts use IndexedDB, with automatic migration of older localStorage drafts. Sketch strokes, shapes, arrows, and text remain separately editable in the local draft; submissions and downloads contain the rendered image. The **Select** tool (**V**, except while typing) selects an element or all elements enclosed by a dragged selection box. Shift-click adds or removes elements; Escape clears the selection. Drag a selected element to move the entire selection, or switch to **Move** (**G**), which retains the selection. Arrow keys nudge it 1 px, or 10 px with Shift; moves support undo/redo. Older flattened artwork opens as one movable image layer, with any existing editable text preserved separately. `Client/upload-reference.php` uploads one reference per request. The final submission attaches all uploaded IDs in one database transaction, so a failed upload cannot publish a partial brief. Retry IDs prevent duplicate uploads and submissions. Unattached uploads remain private to their owner for retries; they are deleted if the account is deleted.

`client_brief_references` is added automatically through `ensure_database_schema()`, preserving existing `client_briefs.visual_data` images. If the deployment's database user cannot create tables, import the updated `auth/schema.sql` before using multiple references. Both client and artist detail pages display the collection; each download checks ownership or the artist's brief access. The PHP router exposes the upload endpoint and the draft/sketch scripts.

Run `node tests/multiple-references.cjs` for an isolated temporary-database test covering 25 references, upload/submission retries, validation, atomic attachment, client/artist isolation, downloads, and legacy briefs. Run `node tests/run-sketchpad.cjs` for browser checks of draft migration, galleries, sketches, text boxes, and submission retries. The latter defaults to local Microsoft Edge; pass another Chromium executable as its first argument if needed.
