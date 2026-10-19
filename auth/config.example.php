<?php
declare(strict_types=1);

// Copy to config.local.php. This directory is blocked from direct HTTP access.
return [
    'db_host' => '127.0.0.1',
    'db_name' => 'mamungkun_capstone',
    'db_user' => 'root',
    'db_password' => '',
    'google_client_id' => '',
    'google_client_secret' => '',
    'google_redirect_uri' => 'http://localhost/Capstone/auth/google-callback.php',
];
