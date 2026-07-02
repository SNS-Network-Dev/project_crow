# Project Crow — Bridge + Front-End

The Next.js app for the face-recognition check-in system. It is the **bridge**: it owns
the database and the UI, and it is the only thing that talks to the **baremetal**
face-compute service.

```
Browser ──▶ Next.js bridge (this app) ──▶ MySQL (project_crow_* tables)   [source of truth]
                     │
                     └────────────────────▶ Baremetal FastAPI (face compute + matrix)
```

- **Baremetal** does all face work (InsightFace embeddings + cosine top-K) and holds the
  in-memory embedding matrix. It has **no DB access**. See [`../baremetal-contract.md`](../baremetal-contract.md)
  for exactly what it must expose — that document is the contract.
- **This bridge** owns MySQL, stores photos on disk, enriches matches with names/thumbnails,
  logs check-ins, and **keeps the baremetal matrix in sync** (re-loads it on restart/drift).

## Routes

| Route | What it is |
|---|---|
| `/` | Landing / links |
| `/register` | Enroll a person (photo upload or capture, name, consent) |
| `/checkin` | Phone selfie check-in |
| `/kiosk` | Full-screen capture for a fixed webcam |
| `/admin` | Recent check-ins + enrolled people (with delete) |

## Bridge API (called by the browser)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/register` | multipart `photo,name,email?,details?,consent` → `{id,name}` |
| `POST` | `/api/checkin` | multipart `frame` → `{candidates:[{person_id,name,photo_url,score,confident}]}` |
| `POST` | `/api/confirm` | `{person_id,score}` → logs a check-in |
| `GET`  | `/api/checkins` | recent check-ins (admin) |
| `GET`  | `/api/people` | enrolled people (manual-entry fallback) |
| `DELETE` | `/api/people/:id` | delete person: DB row + photo + matrix entry |
| `GET`  | `/api/photos/:id` | registration thumbnail (served from `PHOTO_DIR`) |
| `GET`  | `/api/health` | bridge + DB + baremetal status; forces a matrix sync |

## Configuration

- **DB credentials** come from the **project-root `../.env`** (`DB_HOST/DB_USER/DB_PASS/DB_NAME`).
  `lib/config.ts` parses it with a tolerant reader (the password contains a `#`, which
  `dotenv` would mis-parse as a comment — so we don't use dotenv).
- **Bridge config** is in `.env.local` (see `.env.local.example`):
  - `BAREMETAL_URL` — e.g. `https://103.47.130.195/crow-api/api` (nginx prefix + FastAPI `/api`,
    same convention as `project_centaur`).
  - `BAREMETAL_INSECURE_TLS` — `true` only if the baremetal serves a **self-signed cert**
    (skips TLS verification for baremetal calls only). Default `false`.
  - `BAREMETAL_TOKEN` — optional bearer token; blank = no auth (centaur convention).
  - `PHOTO_DIR` — where registration JPEGs are stored.

## Run (local dev)

```bash
npm run dev          # http://localhost:3000/project_crow  (localhost is secure → camera works)
```

## Deployment on this host (production)

The app lives at **`/var/www/project_crow`** (deliberately OUTSIDE the Apache docroot
`/var/www/html`, so its source/.env are never web-served).

- **Service:** `crow-bridge.service` (systemd) runs `next start -p 3100 -H 127.0.0.1`,
  enabled on boot, `Restart=always`.
  ```bash
  sudo systemctl {status,restart} crow-bridge.service
  # after code changes: npm run build && sudo systemctl restart crow-bridge.service
  ```
- **Reverse proxy:** Apache (`/etc/httpd/conf.d/itworld.my.conf`) proxies
  `/project_crow` and `/project_crow/*` → `http://127.0.0.1:3100/project_crow…`.
  Served at **`https://aimy.com.my/project_crow`**.
- **basePath:** `NEXT_PUBLIC_BASE_PATH=/project_crow` (in `.env.local`) must match the
  Apache path and `next.config.ts` basePath.

**Camera needs a VALID HTTPS cert.** `getUserMedia` is blocked on cert-error origins,
so a self-signed cert won't do for the camera pages — the domain needs a trusted cert
(e.g. Let's Encrypt, as itworld.my already uses).

## DB schema

Tables live in the shared `ai_marketplace` MySQL DB, namespaced `project_crow_*`. See
[`../db/schema.sql`](../db/schema.sql). They are already created.
