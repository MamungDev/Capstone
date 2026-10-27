<?php
declare(strict_types=1);

// Copy to config.local.php. This directory is blocked from direct HTTP access.
return [
    'db_driver' => 'mysql', // Set to pgsql for Supabase PostgreSQL.
    'db_host' => '127.0.0.1',
    'db_name' => 'mamungkun_capstone',
    'db_user' => 'root',
    'db_password' => '',
    'admin_password' => '', // Local only; use ADMIN_PASSWORD in Vercel (16+ characters).
    'admin_allowed_emails' => [], // Lowercase Gmail addresses allowed to enroll as administrators.
    'admin_mfa_key' => '', // Optional stable secret used to encrypt admin authenticator keys.
    'google_client_id' => '',
    'google_client_secret' => '',
    'google_redirect_uri' => 'http://localhost/Capstone/auth/google-callback.php',
];
