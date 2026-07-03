-- Project Crow — add admin users table
-- Run against the ai_marketplace DB. Safe to re-run (IF NOT EXISTS).
--
-- Usage:
--   mysql -h 52.77.90.16 -u aimarketplace -p ai_marketplace < /var/www/project_crow/db/migrate_admins.sql

CREATE TABLE IF NOT EXISTS project_crow_admins (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    email         VARCHAR(255)    NOT NULL,
    password_hash VARCHAR(255)    NOT NULL,
    created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_crow_admins_email (email),
    KEY idx_crow_admins_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
