# Project Crow — Baremetal Face-Compute Service Contract

> **Audience:** the team implementing the baremetal FastAPI service.
> **This document is the contract.** The Next.js *bridge* is written against exactly
> these endpoints, wire formats, and behaviors. If you need to change any of them,
> change this doc first and tell the bridge owner — don't diverge silently.

Read [face-checkin-build-spec.md](face-checkin-build-spec.md) for the *why* behind the
face-recognition design (model choice, QC asymmetry, thresholds). This file specifies
only the **service boundary**: what the baremetal must expose to the bridge.

---

## 0. Your role in one paragraph

You are a **stateful, in-memory face-compute microservice**. You run InsightFace
(`buffalo_l`, 512-d ArcFace), you hold **all enrolled embeddings in an in-memory numpy
matrix**, and you do the cosine top-K matching. **You have NO database access.** The
bridge (Next.js) owns the MySQL database and is the single source of truth. Your matrix
is a *derived cache* that the bridge fills and keeps in sync. On restart your matrix is
empty until the bridge re-loads it (see §4, Sync model). The browser never calls you
directly — **only the bridge calls you**, over a private link with a shared token.

```
Browser ──HTTPS──▶ Next.js bridge ──(HTTPS self-signed, /crow-api/api)──▶ Baremetal (you)
                        │
                        └──▶ MySQL (project_crow_* tables)   ◀── you cannot reach this
```

---

## 1. Networking, auth, config

**Follow the house convention** — same as `project_centaur` on the GPU host. The bridge
is written to call you exactly the way centaur's front-end calls its service.

- **Deployment:** run the FastAPI on the GPU host and expose it through **nginx with a
  per-service path prefix**, mirroring centaur. centaur is `https://103.47.130.195/centaur-api/api/...`;
  Crow should be **`https://103.47.130.195/crow-api/api/...`** — i.e. add an nginx location
  `crow-api/` that proxies to this FastAPI, and mount your routes under **`/api`**. So the
  endpoints in §3 are reached at `…/crow-api/api/health`, `…/crow-api/api/checkin`, etc.
  The bridge stores this base as `BAREMETAL_URL` (e.g. `https://103.47.130.195/crow-api/api`).
- **TLS:** the GPU host serves a **self-signed cert** (centaur calls it with `curl -sk` /
  `SSL_VERIFYPEER=false`). The bridge skips verification for these calls (scoped, via
  `BAREMETAL_INSECURE_TLS=true`). No action needed from you beyond serving over HTTPS as
  centaur does. If/when a trusted cert is installed, the bridge can flip the flag off.
- **Auth:** centaur uses **no auth header**, so auth is **optional**. If you add one,
  accept `Authorization: Bearer <token>` and reject mismatches with `401`; the bridge sends
  it only when `BAREMETAL_TOKEN` is set (read yours from `CROW_BAREMETAL_TOKEN`). Default:
  no token, rely on the host/network not being public.
- **CORS:** the bridge (Next.js server) is the only caller — the browser never hits you
  directly — so permissive CORS is not required. (centaur allows it because its browser
  dashboard calls directly; Crow proxies everything through the bridge.)
- Request size: accept image uploads up to **15 MB** (phone photos are large). Reject
  larger with `413`.

---

## 2. Embedding wire format (exact — both sides must agree byte-for-byte)

An embedding is a **512-dimensional, L2-normalized, `float32`, little-endian** vector =
**2048 bytes** — identical to `np.float32(normed_embedding).tobytes()`.

- **On the wire (JSON):** base64 of those 2048 bytes → field name `embedding`.
- The bridge stores the *raw 2048 bytes* in MySQL `VARBINARY(2048)` and base64-encodes
  them when sending back to you. Decode with
  `np.frombuffer(base64.b64decode(s), dtype=np.float32)` → shape `(512,)`.
- Always return / accept the **already L2-normalized** vector (InsightFace's
  `face.normed_embedding`). Because both stored and query vectors are unit-norm,
  **cosine similarity == dot product** — no per-request normalization needed.

---

## 3. Endpoints you must expose

All request/response bodies are JSON unless marked `multipart/form-data`.
All error bodies are `{ "error": "<human-readable message>" }`.

### 3.1 `GET /health`
Liveness + matrix state. Called frequently by the bridge to detect restarts.

```json
200 → {
  "ok": true,
  "model_ready": true,          // false until buffalo_l is loaded & prepared
  "matrix_count": 512,          // number of embeddings currently in memory
  "epoch": "a1b2c3d4"           // changes on every process (re)start — see §4
}
```
`epoch` must be a value that is **stable for the life of the process and different after
any restart** (e.g. a uuid4 generated at startup, or the process start timestamp). This
is how the bridge knows your matrix was wiped and needs re-loading.

### 3.2 `POST /embed/enroll`  (multipart: `photo`)
**Strict QC path.** Detect faces, enforce quality, return one embedding. Do **not** touch
the matrix here — the bridge assigns the DB id first, then calls `/matrix/add` (§3.4).

- Exactly one detectable face, bbox min side ≥ `MIN_FACE_PX` (80). Reject otherwise.

```json
200 → { "embedding": "<base64 2048 bytes>", "dim": 512 }
```
QC failures return **422** with a human-readable, client-safe message:
```json
422 → { "error": "No face detected. Use a clear, front-facing photo." }
422 → { "error": "Multiple faces detected. Submit a solo photo." }
422 → { "error": "Face too small/low-res. Move closer and retry." }
400 → { "error": "Could not decode image" }
```

### 3.3 `POST /checkin`  (multipart: `frame`)
**Lenient match path.** Embed the **largest** face (never reject — the user is cooperative
and a human confirms), then cosine top-K against the in-memory matrix.

- Apply `SIM_FLOOR` (0.30): do not return candidates below it.
- Sort descending by score, cap at `TOP_K` (3).
- Set `confident: true` when `score >= SIM_STRONG` (0.50).
- No face found → return empty list (the bridge shows "no face — try again / manual").
- Empty matrix → return empty list.

```json
200 → {
  "candidates": [
    { "person_id": 41, "score": 0.62, "confident": true  },
    { "person_id": 88, "score": 0.41, "confident": false }
  ]
}
200 → { "candidates": [] }     // no face, or nothing above SIM_FLOOR
```
You return **only `person_id` + `score` + `confident`** — you have no names or photos.
The bridge joins `person_id` to name/photo from MySQL before showing the user.

### 3.4 `POST /matrix/add`  (json)
Append one embedding to the matrix. Called by the bridge right after it inserts a new
person and gets the DB-assigned id.
```json
body  → { "person_id": 91, "embedding": "<base64 2048 bytes>" }
200   → { "ok": true, "matrix_count": 513 }
```
If `person_id` already exists in the matrix, **replace** its row (idempotent re-enroll).

### 3.5 `POST /matrix/remove`  (json)
Drop a person from the matrix (the bridge's delete/retention path).
```json
body  → { "person_id": 91 }
200   → { "ok": true, "matrix_count": 512 }
```
Unknown `person_id` → still `200 { "ok": true, ... }` (idempotent).

### 3.6 `POST /matrix/load`  (json)
**Replace the entire matrix** in one shot. This is how the bridge (re)hydrates you after a
restart or on its own startup. Must be idempotent and atomic (don't leave a half-loaded
matrix if it fails).
```json
body → { "items": [ { "person_id": 1, "embedding": "<base64>" }, ... ] }   // may be []
200  → { "ok": true, "matrix_count": 4127, "epoch": "a1b2c3d4" }
```
Expect up to a few thousand items. Vectorize the load (`np.vstack`); don't loop-append.

---

## 4. Sync model (critical — you have no DB)

Your matrix is a **cache** of `(person_id, embedding)` owned by MySQL. The bridge keeps it
consistent; you just expose the mutators above and report `matrix_count` + `epoch`.

The bridge's responsibilities (informational — so you understand the call patterns you'll
see):
- **Bridge startup:** reads all rows from MySQL → one `POST /matrix/load`.
- **Register:** `POST /embed/enroll` → insert into MySQL → `POST /matrix/add`.
- **Delete:** delete from MySQL → `POST /matrix/remove`.
- **Restart recovery:** the bridge polls `GET /health`. If your `epoch` changed (you
  restarted) or `matrix_count` doesn't match its DB count, it re-issues `POST /matrix/load`.

What this requires of **you**:
1. `epoch` must change on every restart, and `matrix_count` must be accurate at all times.
2. `/matrix/load` must fully replace state atomically.
3. Until the first `/matrix/load` after a restart, it is **OK** for `/checkin` to return
   `{ "candidates": [] }` — but it must not error. The bridge's health poll will repair you
   within seconds.
4. Be safe under concurrent `/checkin` reads during a `/matrix/load` write (use a lock or
   swap a freshly-built matrix in atomically). A check-in racing a reload must never crash.

---

## 5. Internal requirements (your implementation — from the build spec)

These are not negotiable contract surface, but the bridge depends on them being true:
- **Model:** InsightFace `buffalo_l`, `det_size=(640,640)`, 512-d `normed_embedding`.
- **Pre-download the model pack during setup**, not on first request (~300 MB to
  `~/.insightface`). `/health.model_ready` stays `false` until prepared.
- **CPU** `onnxruntime` by default; `onnxruntime-gpu` only if a CUDA GPU is present.
- **Enroll strict / check-in lenient** asymmetry exactly as in spec §5.1.
- **Thresholds** `TOP_K=3`, `SIM_FLOOR=0.30`, `SIM_STRONG=0.50` — keep these configurable;
  they are starting values to calibrate on real enrolled data, **not** fixed truth.
- **Same model pack for every embedding.** If you ever change the model, all stored
  embeddings become incomparable and everyone must be re-enrolled — coordinate with the
  bridge owner before doing that.
- **No liveness / anti-spoofing**, **no FAISS/vector DB**, **no auto check-in** (these are
  explicit non-goals in the spec).

---

## 6. Quick reference

| Method | Path | Body | Returns |
|---|---|---|---|
| `GET`  | `/health`        | —                                   | `{ ok, model_ready, matrix_count, epoch }` |
| `POST` | `/embed/enroll`  | multipart `photo`                   | `{ embedding, dim }` or `422 { error }` |
| `POST` | `/checkin`       | multipart `frame`                   | `{ candidates: [{ person_id, score, confident }] }` |
| `POST` | `/matrix/add`    | `{ person_id, embedding }`          | `{ ok, matrix_count }` |
| `POST` | `/matrix/remove` | `{ person_id }`                     | `{ ok, matrix_count }` |
| `POST` | `/matrix/load`   | `{ items: [{ person_id, embedding }] }` | `{ ok, matrix_count, epoch }` |

Base URL `https://103.47.130.195/crow-api/api` (nginx prefix + FastAPI `/api`, self-signed
TLS — same convention as centaur). Auth optional (bearer only if configured). Embeddings are
base64 of 2048 bytes (512 × float32 LE, L2-normalized).
