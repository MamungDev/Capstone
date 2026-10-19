# Local account demo

This project uses the XAMPP MySQL server for registration. phpMyAdmin lets you inspect the `mamungkun_capstone` database and its `users` table; PHP connects to that database through PDO. The table was created locally from [auth/schema.sql](auth/schema.sql). On another computer, import that SQL file in phpMyAdmin before testing.

Start **Apache** and **MySQL** in the XAMPP Control Panel, then open `http://localhost/Capstone/`. Choose **Client** or **Artist** in the auth modal. Create an account with a name, email, and password of at least eight characters. After registration, sign out and sign back in with the same role to demonstrate the separate paths. The `role` column in phpMyAdmin shows how the accounts are separated; `password_hash` contains a hash, not the entered password.

Client accounts enter `Client/Client UI.php`. Artist accounts enter `Artist/Artist UI.php`, a temporary welcome page until the full artist interface is built. Each page checks the account role on the server. Client drafts remain in the browser for that account.

Clients can complete **Describe → Set direction → Add references → Review**, then select **Submit brief**. Submission saves a snapshot of the project details, keywords, and optional image or sketch to MySQL. A confirmation appears only after the server saves it. **View submitted brief** opens the saved snapshot; **My briefs** lists the signed-in client's submissions, including after signing out and back in. **Create another brief** starts a new draft without removing previous submissions. Retrying an unchanged submission does not create a duplicate.

The `client_briefs` table has already been created in the local `mamungkun_capstone` database. No manual phpMyAdmin setup is needed on this computer. On another installation, import the updated `auth/schema.sql`; it creates missing tables without deleting existing accounts. The `client_id` column links each brief to its owner, `details_json` contains the written brief, and `visual_data` stores image bytes. View images through **My briefs**, rather than the raw BLOB in phpMyAdmin. Uploads in the browser are limited to 2 MB to leave room for local draft storage; the server also validates image type, size, and dimensions.

Submitted briefs are stored and viewable by their client. Artist assignment, messaging, and status tracking are not implemented yet. Google sign-in is still deferred.

To run the submission regression checks with Apache and MySQL running, use `node tests/brief-submission.cjs` from the project folder. It creates temporary accounts, checks persistence, access isolation, validation, images, sketches, and retry handling, then deletes its test records.

The local database connection is configured in `auth/config.local.php`. That file is ignored by Git and denied direct HTTP access. If your XAMPP MySQL root password changes, update `db_password` there. Do not put the database credentials in `index.php` or JavaScript.

Google sign-in is deferred until launch and is hidden from the demo modal. Password recovery is also not configured yet. A public launch should add email verification, password recovery, rate limiting, HTTPS, and a restricted MySQL user.
