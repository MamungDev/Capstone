-- Select the target database before importing this file.
-- Local XAMPP: mamungkun_capstone. Aiven: defaultdb (or a database you created there).

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  role ENUM('client', 'artist') NOT NULL,
  email VARCHAR(254) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NULL,
  google_sub VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY users_email_unique (email),
  UNIQUE KEY users_google_sub_unique (google_sub)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS client_briefs (
  id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  client_id BIGINT UNSIGNED NOT NULL,
  project_name VARCHAR(120) NOT NULL,
  details_json LONGTEXT NOT NULL,
  payload_hash CHAR(64) CHARACTER SET ascii NOT NULL,
  visual_mime VARCHAR(20) NULL,
  visual_data MEDIUMBLOB NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY client_briefs_owner_created (client_id, created_at),
  CONSTRAINT client_briefs_owner FOREIGN KEY (client_id) REFERENCES users (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS app_sessions (
  session_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  session_data MEDIUMBLOB NOT NULL,
  expires_at BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (session_id),
  KEY app_sessions_expires (expires_at)
) ENGINE=InnoDB;
