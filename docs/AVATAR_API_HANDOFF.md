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
  **`variants`** (optional int **1–4**, default 1), **`prompt`** / **`pair_prompt`** (optional
  admin prompt overrides — see "Admin prompt override" below).

**Variants — let the attendee pick a pose.** With `variants>1` the endpoint returns several
takes: **(N-1) "pose-follow"** first (the guest keeps their **own real gesture** — read from the
photo by a vision model — and Kelvin reacts/mirrors it) **+ 1 "arm-around"** last (the classic,
arms on shoulders). The guest's face is computed once and shared. Latency: `variants=4` ≈ ~35 s warm.

- **`variants=1` (default) returns the legacy single-image envelope** (`image`, `width`, …) —
  that single image is the arm-around pose.
- **`variants>1` returns an `images[]` array** (see response section). Order is
  `[pose-follow × (N-1), arm-around]`; each item has a `variant` label and its own `seed`.

```bash
# single (legacy)
curl -sk -X POST https://103.47.130.195/crow-api/api/avatar/kelvin -F photo=@guest.jpg -F seed=42
# four variants to choose from
curl -sk -X POST https://103.47.130.195/crow-api/api/avatar/kelvin -F photo=@guest.jpg -F variants=4
```

### 2) `POST /group`  — group photo → figurines, each keeping their own pose
- **1–4 people** expected in `photo`. Each person is converted independently (so count +
  identity are preserved) and composited side by side on the same ground line.
- **Pose-preserving:** a vision model reads each person's gesture (left-to-right) and the
  figurine strikes it (thumbs up, peace, arms crossed, hands on hips, arm raised, etc.).
- **Returns an `images[]` array**: **`variants` group pictures (default 3), figurines
  ONLY — no Mr Kelvin.** The bridge shows them as a chooser.
- Form fields: `photo` (required), `seed` (optional int), `variants` (optional int, default 3,
  max 6), **`prompt`** (optional admin per-person prompt override — see below).

> ⚠ **Change:** `/group` no longer appends a "group+kelvin" image. `variants=3` now returns
> **3** images (was 4). The bridge must NOT assume a Kelvin picture is present. Kelvin lives
> only on `/kelvin`.

```bash
curl -sk -X POST https://103.47.130.195/crow-api/api/avatar/group -F photo=@group.jpg
# -> {"images":[{...,"variant":"group"},{...,"group"},{...,"group"}], "count":3, "mode":"group"}
```

### Health / readiness (ops)
`GET /health` → `{ "ok": true, "avatar_model_ready": bool, "loading": bool, "error": null|str }`
- Poll this after a deploy/reboot; the models warm at startup (~35–40 s) and it flips
  `avatar_model_ready:true`. Requests before that return `503`.

### Live queue view (admin)
`GET /status` → what's running now, who's queued (ordered, with positions + ETA), capacity,
and rolling-average durations. Use it to show the booth a live wait estimate.
```json
{
  "running": { "id": "4", "endpoint": "kelvin", "elapsed_s": 7.0 },
  "queued":  [ { "id": "5", "endpoint": "kelvin", "pos": 1, "eta_s": 8 },
               { "id": "6", "endpoint": "group",  "pos": 2, "eta_s": 24 } ],
  "capacity": 3, "free_slots": 0,
  "avg_ms": { "kelvin": 15286, "group": 42466 },
  "ready": true
}
```
- `eta_s` = estimated seconds until that queued job **starts** (running-job remainder + all
  jobs ahead). `capacity` is the total in-flight limit; when `free_slots:0` new requests get
  `503`. Generation is still **one-at-a-time** (serial) — `/status` is visibility, not
  parallelism (parallelism is a planned phase 2).

---

## Success response

**Single image** (`/kelvin` or `/generate` with `variants=1` default only):
```json
{
  "image": "<base64 PNG, RGBA, 1280x1024, transparent bg>",
  "width": 1280, "height": 1024, "seed": 42, "ms": 11552,
  "mode": "kelvin", "people": 1
}
```
(`/group` always returns the `images[]` array form below, even for one variant.)

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

## Admin prompt override (send the prompt as an argument)

The AWS side can override the generation prompt per request. **Optional** — omit them and
behaviour is exactly today's house style.

- **`prompt`** — overrides the *figurine-conversion* stage (where the art style lives):
  `/kelvin` guest conversion, or `/group` per-person conversion.
- **`pair_prompt`** — `/kelvin` only; overrides the *guest+Kelvin combine* stage.
- **`{gesture}` token:** if your prompt contains the literal text `{gesture}`, it is replaced
  with the pose the vision model detected (e.g. `giving a double thumbs up`). Omit the token
  and pose-following is effectively off for that request. Safe literal replacement — stray
  `{ }` braces won't break anything.
- **Max length:** 2000 chars (else `400`). Empty/whitespace → house prompt.

> You own the guardrails when you override. If you drop the skin-tone / slim-body /
> front-facing / plain-background instructions, quality can regress. **Start from the
> current defaults below and edit them** rather than writing from scratch.

```bash
curl -sk -X POST .../kelvin -F photo=@g.jpg -F variants=2 \
  -F prompt='...your stage-1 text, include {gesture}...'
```

### Current default prompts (the baseline to copy & edit)

**`prompt` default — /kelvin arm-around (PROMPT_STAGE1)**
```text
Turn this exact person into a premium 3D collectible caricature figurine with a natural, well-proportioned body and only a SUBTLY enlarged head — the head is about one quarter of the total body height, a tasteful caricature, NOT a big-head bobblehead. Glossy smooth, highly detailed, sharp high-resolution semi-realistic render, soft studio lighting. Keep their EXACT face, skin tone, ethnicity, hairstyle and their own clothing. Do NOT add glasses or a beard unless they already have them. Full body head to feet, standing, friendly smile, plain light-grey background.
```

**`prompt` default — /kelvin pose-follow (PROMPT_STAGE1_POSE)**
```text
Turn this exact person into a premium 3D collectible caricature figurine with a natural, well-proportioned body and only a SUBTLY enlarged head (about one quarter of total height, NOT a big-head bobblehead). Glossy smooth, highly detailed, sharp render, soft studio lighting. Keep their EXACT face, skin tone, ethnicity, hairstyle and their own clothing. Do NOT add glasses or a beard unless they already have them. IMPORTANT POSE: the figurine is {gesture}. The figurine FACES THE CAMERA directly, front-facing, looking straight ahead. Full body head to feet, plain light-grey background.
```

**`pair_prompt` default — /kelvin arm-around combine (PROMPT_STAGE2)**
```text
The two reference images each show one premium 3D collectible caricature figurine. Combine BOTH into a single sharp high-resolution photo posing together for one friendly candid photo: the FIRST person on the LEFT, the SECOND man (Kelvin) on the RIGHT. BOTH figures must have the SAME body proportions and the SAME subtly-enlarged head size — do NOT make the left person's head bigger than the right person's; match their head sizes. Standing close on the same ground line, same soft studio lighting, plain light-grey background. Keep each person's exact face, hair, outfit and style from their own reference image. Kelvin gives a friendly gesture (an arm around the shoulder or a thumbs up). Both full body head to feet, feet visible, sharp glossy highly-detailed 3D render.
```

**`pair_prompt` default — /kelvin pose-follow combine (PROMPT_STAGE2_POSE)**
```text
The two reference images each show one premium 3D collectible caricature figurine. Combine BOTH into a single sharp high-resolution photo posing together for one friendly candid photo: the FIRST person on the LEFT, the SECOND man (Kelvin) on the RIGHT. BOTH figures must have the SAME body proportions and the SAME subtly-enlarged head size — do NOT make the left person's head bigger than the right person's; match their head sizes. The FIRST person (the guest) is {gesture} — keep that exact pose. Generate Kelvin's gesture to REACT TO and COMPLEMENT the guest — mirror it, do a matching gesture, or a natural paired reaction — so they look like they are genuinely posing together in that moment. BOTH figures FACE THE CAMERA directly, bodies and faces turned to the front, looking straight ahead at the viewer (do NOT turn them sideways or toward each other). Standing close on the same ground line, same soft studio lighting, plain light-grey background. Keep each person's exact face, hair, outfit and style from their own reference image. Both full body head to feet, feet visible, sharp glossy highly-detailed 3D render.
```

**`prompt` default — /group per person (PROMPT_GROUP_PERSON)**
```text
Turn this exact person into a premium 3D collectible caricature figurine with a natural, well-proportioned body and only a SUBTLY enlarged head (about one quarter of total height, NOT a big-head bobblehead). Glossy smooth, highly detailed, sharp render, soft studio lighting. Keep their EXACT face, skin tone, ethnicity, hairstyle and their own clothing. Do NOT add glasses or a beard unless they already have them. IMPORTANT POSE: the figurine is {gesture}. The figurine FACES THE CAMERA, front-facing, looking straight ahead. Full body head to feet, standing, plain light-grey background.
```

---

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
| `/kelvin` (variants=1) | ~12 s | single arm-around image |
| `/kelvin` variants=4 | ~35 s | 3 pose-follow + 1 arm-around |
| `/group` 3 people (3 variants, no kelvin) | ~45 s | scales with people × variants |
| `/group` 4 people | ~60–75 s | lower `variants` to speed up |

Pose reading uses the local Gemma-4 vision model (`:8085`); if it is down the figures fall
back to a neutral standing pose (generation never fails).

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
