-- Project Crow — add registration detail columns + qr_code + updated_at
-- Run against the ai_marketplace DB. Safe to re-run (skips existing columns).
-- MySQL 8.0 compatible (no IF NOT EXISTS for columns).
--
-- Usage:
--   mysql -h 52.77.90.16 -u aimarketplace -p ai_marketplace < /var/www/project_crow/db/migrate.sql

DELIMITER //

CREATE PROCEDURE IF NOT EXISTS crow_add_column(IN tbl VARCHAR(128), IN col VARCHAR(128), IN def TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = tbl
      AND COLUMN_NAME = col
  ) THEN
    SET @sql = CONCAT('ALTER TABLE ', tbl, ' ADD COLUMN ', col, ' ', def);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END //

DELIMITER ;

CALL crow_add_column('project_crow_people', 'contact_number',    'VARCHAR(50)  NULL AFTER email');
CALL crow_add_column('project_crow_people', 'company_email',     'VARCHAR(255) NULL AFTER contact_number');
CALL crow_add_column('project_crow_people', 'full_company_name', 'VARCHAR(255) NULL AFTER company_email');
CALL crow_add_column('project_crow_people', 'designation',       'VARCHAR(255) NULL AFTER full_company_name');
CALL crow_add_column('project_crow_people', 'invited_by',        'VARCHAR(255) NULL AFTER designation');
CALL crow_add_column('project_crow_people', 'remarks',           'TEXT         NULL AFTER invited_by');
CALL crow_add_column('project_crow_people', 'qr_code_path',      'VARCHAR(512) NULL AFTER remarks'); -- 8-char random QR code shown in /admin
CALL crow_add_column('project_crow_people', 'updated_at',        'DATETIME     NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP AFTER created_at');

DROP PROCEDURE IF EXISTS crow_add_column;
