# Local account demo

This project uses the XAMPP MySQL server for registration. phpMyAdmin lets you inspect the `mamungkun_capstone` database and its `users` table; PHP connects to that database through PDO. The table was created locally from [auth/schema.sql](auth/schema.sql). On another computer, import that SQL file in phpMyAdmin before testing.

Start **Apache** and **MySQL** in the XAMPP Control Panel, then open `http://localhost/Capstone/`. Choose **Client** or **Artist** in the auth modal. Create an account with a name, email, and password of at least eight characters. After registration, sign out and sign back in with the same role to demonstrate the separate paths. The `role` column in phpMyAdmin shows how the accounts are separated; `password_hash` contains a hash, not the entered password.

Client accounts enter `Client/Client UI.php`. Artist accounts enter `Artist/Artist UI.php`, a separate studio inbox based on the prototype's artist design. Each page checks the account role on the server. Client drafts remain in the browser for that account.

Clients can complete **Describe → Set direction → Add references → Review**, then select **Submit brief**. Submission saves a snapshot of the project details, keywords, and optional image or sketch to MySQL. A confirmation appears only after the server saves it. **View submitted brief** opens the saved snapshot; **My briefs** lists the signed-in client's submissions, including after signing out and back in. **Create another brief** starts a new draft without removing previous submissions. Retrying an unchanged submission does not create a duplicate.

The `client_briefs` table has already been created in the local `mamungkun_capstone` database. No manual phpMyAdmin setup is needed on this computer. On another installation, import the updated `auth/schema.sql`; it creates missing tables without deleting existing accounts. The `client_id` column links each brief to its owner, `details_json` contains the written brief, and `visual_data` stores image bytes. View images through **My briefs**, rather than the raw BLOB in phpMyAdmin. Uploads in the browser are limited to 2 MB to leave room for local draft storage; the server also validates image type, size, and dimensions.

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

Vercel runs this PHP project through the community `vercel-php` runtime configured in `vercel.json`. Import the GitHub repository `MamungDev/Capstone` in Vercel, leave the root directory as `.`, choose the **Other** framework preset, and leave the build command and output directory empty.

Use a hosted MySQL database; the XAMPP database at `127.0.0.1` is only available on your computer. Import `auth/schema.sql` into that database, then add these Vercel project environment variables for Production and Preview:

- `DB_HOST`: database hostname, without a port suffix
- `DB_PORT`: database port, usually `3306`
- `DB_NAME`: database name
- `DB_USER`: restricted database user
- `DB_PASSWORD`: database password
- `DB_SSL_CA`: optional path to the provider's CA certificate file when required
- `SESSION_DRIVER`: `mysql`

The `app_sessions` table in the schema stores sign-in sessions across serverless function instances. The session cookie uses `/` automatically on Vercel. Keep database credentials in Vercel environment variables; do not commit `auth/config.local.php`.

Briefs that include large images may exceed Vercel's function request-size limit because images are currently sent as part of the PHP request. Test image submissions after deployment; supporting larger uploads reliably requires direct-to-object-storage uploads.
