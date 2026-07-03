-- Project Crow — face check-in schema
-- Lives inside the SHARED `ai_marketplace` MySQL DB, so every table is
-- namespaced with the `project_crow_` prefix. Source of truth for all data.
-- The baremetal matrix is only a derived cache of (id, embedding) from here.

CREATE TABLE IF NOT EXISTS project_crow_people (
    id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name              VARCHAR(255)    NOT NULL,
    email             VARCHAR(255)    NULL,
    contact_number    VARCHAR(50)     NULL,                 -- phone / mobile
    company_email     VARCHAR(255)    NULL,                 -- work email
    full_company_name VARCHAR(255)    NULL,                 -- company / org name
    designation       VARCHAR(255)    NULL,                 -- job title
    invited_by        VARCHAR(255)    NULL,                 -- referrer / inviter
    details           JSON            NULL,                 -- arbitrary metadata (legacy)
    remarks           TEXT            NULL,                 -- free-text notes
    embedding         VARBINARY(2048) NOT NULL,             -- 512 x float32 LE, L2-normalized (== np.float32(vec).tobytes())
    photo_path        VARCHAR(512)    NULL,                 -- filename on bridge filesystem (see PHOTO_DIR)
    qr_code_path      VARCHAR(512)    NULL,                 -- 8-char random QR code shown in /admin
    consent_at        DATETIME        NULL,                 -- when the person consented to face-data use (privacy)
    created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME        NULL     DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_crow_people_email (email),
    KEY idx_crow_people_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_crow_checkins (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    person_id     BIGINT UNSIGNED NOT NULL,
    score         FLOAT           NOT NULL,           -- cosine similarity at match time
    checked_in_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_crow_checkins_person (person_id),
    KEY idx_crow_checkins_time (checked_in_at),
    CONSTRAINT fk_crow_checkin_person FOREIGN KEY (person_id)
        REFERENCES project_crow_people(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_crow_admins (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    email         VARCHAR(255)    NOT NULL,
    password_hash VARCHAR(255)    NOT NULL,           -- PBKDF2 salt:hash (base64)
    created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_crow_admins_email (email),
    KEY idx_crow_admins_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
