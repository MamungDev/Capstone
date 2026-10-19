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

Client accounts cannot open the artist inbox or its reference endpoints. Clients can only view their own submissions through **My briefs**. Artist assignment, messaging, editable studio notes, and status tracking are not implemented yet. Google sign-in is still deferred.

To run the client and artist regression checks with Apache and MySQL running, use `node tests/brief-submission.cjs` from the project folder. It creates temporary accounts and briefs, checks persistence, access isolation, validation, images, sketches, retry handling, artist sign-in/sign-out, inbox search/filter/sort/pagination, and reference downloads, then deletes its test records. Existing accounts and briefs are preserved. The artist checks are in `tests/artist-workspace.cjs` and run as part of this command. These are HTTP/database checks; visual layout should also be reviewed in a browser at desktop and mobile widths.

The local database connection is configured in `auth/config.local.php`. That file is ignored by Git and denied direct HTTP access. If your XAMPP MySQL root password changes, update `db_password` there. Do not put the database credentials in `index.php` or JavaScript.

Google sign-in is deferred until launch and is hidden from the demo modal. Password recovery is also not configured yet. A public launch should add email verification, password recovery, rate limiting, HTTPS, and a restricted MySQL user.

## Vercel deployment

Vercel runs this PHP project through the community `vercel-php` runtime configured in `vercel.json`. Import the GitHub repository `MamungDev/Capstone` in Vercel, leave the root directory as `.`, choose the **Other** framework preset, and leave the build command and output directory empty. The XAMPP database at `127.0.0.1` is only available on your computer; Vercel needs a hosted MySQL service such as Aiven.

### Aiven MySQL

1. In the Aiven MySQL service, use the existing `defaultdb` database shown under **Connection information**. Download its **CA certificate** (`ca.pem`). Keep the Aiven password out of project files and chat.
2. The deployed app creates missing `users`, `client_briefs`, and `app_sessions` tables from `auth/schema.sql` on its first request. The schema uses `CREATE TABLE IF NOT EXISTS`, preserving existing accounts and briefs. If your database user does not have permission to create tables, connect with a MySQL client using the service's **Host**, **Port**, **User**, password, and downloaded CA certificate, then import `auth/schema.sql` into `defaultdb` manually.
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

Briefs that include large images may exceed Vercel's function request-size limit because images are currently sent as part of the PHP request. Test image submissions after deployment; supporting larger uploads reliably requires direct-to-object-storage uploads.
