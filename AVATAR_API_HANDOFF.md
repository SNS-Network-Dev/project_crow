# Avatar-Gen API — Handoff for the Bridge (AWS) Agent

The GPU baremetal service is **live** and exposes two modes behind nginx. This doc is
everything the bridge needs; you do **not** need to know the internal pipeline.

- **Base URL:** `https://103.47.130.195/crow-api/api/avatar`
- **TLS:** self-signed — the bridge must allow the self-signed cert (same as the existing
  face/avatar calls).
- **Auth:** tokenless by default. If `CROW_BAREMETAL_TOKEN` is ever set on the box, send
  `Authorization: Bearer <token>` (shared with the face service).
- **Request:** `multipart/form-data`, field name **`photo`** (JPEG/PNG/WebP, ≤ 15 MB).
- **Every success returns the same JSON envelope** (see below). The `image` is a
  **base64 PNG, RGBA, transparent background, exactly 1280×1024**. Composite it onto the
  fixed poster background exactly as today — nothing else changed about output framing.

---

## Endpoints

### 1) `POST /kelvin`  — single guest posed WITH Mr Kelvin
(Alias: `POST /generate` — identical behavior, kept for backward compatibility.)

- Exactly **one** person expected in `photo`.
- Output: the guest (left) + Kelvin (right) as one candid figurine pair.
- Form fields: `photo` (required), `seed` (optional int), `style` (optional, ignored/house),
  **`variants`** (optional int **1–4**, default 1).

**Variants — let the attendee pick a pose.** With `variants>1` the endpoint returns several
takes to choose from: **1 "arm-around"** (the classic, arms on shoulders) **+ (N-1) "pose-follow"**
(the guest keeps their own hand gesture and Kelvin reacts/mirrors it; different seeds give
different poses). The guest's face/identity is computed once and shared, so extra variants are
cheap (~+5–6 s each). Latency: `variants=4` ≈ ~22–33 s warm.

- **`variants=1` (default) returns the legacy single-image envelope** (`image`, `width`, …).
- **`variants>1` returns an `images[]` array** (see response section). The bridge shows them as
  a chooser; each item has a `variant` label (`"arm-around"` | `"pose-follow"`) and its own `seed`.

```bash
# single (legacy)
curl -sk -X POST https://103.47.130.195/crow-api/api/avatar/kelvin -F photo=@guest.jpg -F seed=42
# four variants to choose from
curl -sk -X POST https://103.47.130.195/crow-api/api/avatar/kelvin -F photo=@guest.jpg -F variants=4
```

### 2) `POST /group`  — group photo → figurines (NO Kelvin by default)
- **1–4 people** expected in `photo`. Each person is converted independently and composited
  side by side (same ground line), so the count and each identity are preserved.
- Optional add-on: form field **`kelvin=1`** appends the fixed Mr Kelvin figure on the right.
- Form fields: `photo` (required), `seed` (optional int), `kelvin` (optional `0`/`1`, default `0`).

```bash
# group only
curl -sk -X POST https://103.47.130.195/crow-api/api/avatar/group -F photo=@group.jpg
# group + Kelvin
curl -sk -X POST https://103.47.130.195/crow-api/api/avatar/group -F photo=@group.jpg -F kelvin=1
```

### Health / readiness (ops)
`GET /health` → `{ "ok": true, "avatar_model_ready": bool, "loading": bool, "error": null|str }`
- Poll this after a deploy/reboot; the models warm at startup (~35–40 s) and it flips
  `avatar_model_ready:true`. Requests before that return `503`.

---

## Success response

**Single image** (`/kelvin` or `/generate` with `variants=1` default, and `/group`):
```json
{
  "image": "<base64 PNG, RGBA, 1280x1024, transparent bg>",
  "width": 1280, "height": 1024, "seed": 42, "ms": 11552,
  "mode": "kelvin" | "group",
  "people": 1,            // present on /kelvin
  "kelvin": true|false    // present on /group (whether Kelvin was appended)
}
```

**Multiple variants** (`/kelvin` or `/generate` with `variants>1`):
```json
{
  "images": [
    { "image": "<base64 PNG RGBA 1280x1024>", "variant": "arm-around",  "seed": 42,   "width":1280,"height":1024,"ms":1300 },
    { "image": "<base64 PNG RGBA 1280x1024>", "variant": "pose-follow", "seed": 1055, "width":1280,"height":1024,"ms":600  }
  ],
  "count": 4, "mode": "kelvin", "seed": 42, "ms": 22100
}
```
Each image is independently valid (same 1280×1024 transparent PNG contract). Show them as a
chooser; when the attendee picks one, use that item's `image`. `seed` per item lets you
reproduce/regenerate a specific pick later.

## Errors (all endpoints, JSON `{ "error": "<message>" }`)

| Code | When | `error` message is safe to show the attendee? |
|---|---|---|
| `400` | missing/empty/undecodable `photo`, bad `seed` | technical — show a generic retry |
| `413` | `photo` > 15 MB | yes ("Image too large, max 15 MB") |
| `422` | **/kelvin:** not exactly one person. **/group:** 0 people, or > 4 people | **yes** — messages are attendee-friendly (e.g. "No people detected. Stand back so everyone is fully in frame.", "Too many people (5). Max 4 per group photo.", "Multiple people detected. One person per photo.") |
| `503` | warming up at startup, or generator busy (queue full) | yes — retry shortly |
| `500` | generation failed | technical — retry |

---

## Latency (warm) — set bridge timeouts accordingly

| Call | Typical | Note |
|---|---|---|
| `/kelvin` (variants=1) | ~10–13 s | one guest + Kelvin |
| `/kelvin` variants=4 | ~22–33 s | 1 arm-around + 3 pose-follow (face computed once, shared) |
| `/group` 1 person | ~6 s | |
| `/group` 3–4 people | ~20–30 s | scales ~ per person (each person = one generation pass) |

Keep the bridge's per-request timeout at **120 s** (unchanged). Generation is **serialized**
on the GPU (one at a time); if more than a few requests queue, extras get `503` — retry.

---

## Guidance to pass through to the capture UI (quality)

- **Ask for FULL-BODY photos** (head-to-feet in frame). Headshots/close-ups make the figurine's
  head come out oversized — the model extrapolates a body from a face-dominant crop. Full-body
  input → correct proportions. (The `422` messages already nudge users to stand back.)
- **Group photos:** everyone facing the camera, standing, up to 4 people, not overlapping heavily.
- Skin tone / ethnicity / outfit colors are preserved; the figurines are front-facing on a
  transparent background ready to drop onto the poster.

## Known limitations (not blockers)
- **Glasses may not be preserved** for bespectacled guests (they can come out without glasses).
- Group figures stand **side by side** (not arm-in-arm); the `/kelvin` pair does interact.
- Everything is **stateless** — no image is stored server-side.

---

## Ops quick reference (baremetal side, for the human/agent on the GPU box)
- systemd unit: `crow-avatar.service` (single worker, `127.0.0.1:8105`, `CUDA_VISIBLE_DEVICES=6,5`).
- `sudo systemctl restart crow-avatar.service` · `journalctl -u crow-avatar.service -f`
- Backend switch: `CROW_AVATAR_BACKEND=pulid_klein` (default) | `klein` | `kontext`.
- Local live suite: `crow-avatar-env/bin/python http_smoke_avatar.py`.
