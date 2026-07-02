# Project Crow — Avatar Generation: TWO-PERSON PAIR (posed together)

> **V2 update (2026-07-02).** You already built V1 of this (guest + Kelvin together, fixed
> "standing side by side, facing camera" pose) — thank you, that's live. This update changes
> two things about what "posed together" means, **on top of** that same live endpoint. Wire
> format, QC, and output framing are **unchanged** — this is a behavior refinement, not a new
> endpoint.
>
> 1. **Kelvin's identity reference changes** from the stylized cutouts (`mr_kelvin.png` /
>    `mr_kelvin_2.png`) to a **real, unstylized photo: `/var/www/project_crow/mr_kelvin_real.jpg`**.
>    Use this the same way you use the guest's photo — as a real-photo identity source, not a
>    style source. The **art style** now comes from one explicit pinned image instead:
>    **`/var/www/project_crow/SF.jpeg`** (see below).
> 2. **The pose is no longer fixed.** The real goal: the guest can walk up and pose however
>    they want — thumbs up, peace sign, arms crossed, jumping, whatever. **Kelvin's pose in the
>    output must react to and match the guest's**, so it looks like a genuine candid photo of
>    the two of them posing together in the moment, not a template two people were pasted into.
>    If the guest does a thumbs up, Kelvin does a thumbs up back. If the guest throws a peace
>    sign, Kelvin does too (or a natural complementary gesture — his arm around the guest's
>    shoulder while the guest peace-signs is also "matching"). This has to be derived from
>    **each guest's actual photo**, every time — not a canned response.

## ✅ VALIDATED RECIPE (2026-07-02, FLUX.2 [klein] 9B) — build the live endpoint on this

Baremetal validated this end-to-end. **Preserve these exact learnings — they were bug fixes,
not preferences:**

- **Model:** FLUX.2 [klein] 9B, **4 steps, guidance 1.0** → ~3 s generate, ~13 s end-to-end
  (well within the 120 s budget).
- **Image order = `[guest, kelvin, style]` — GUEST FIRST. This is the critical fix.** klein
  treats image **#1** as the scene/outfit template. With the style image first, the guest came
  out wearing the style poster's outfit (SF's woman's lanyard + blue pants) with the guest's
  face pasted on — on both 4B and 9B. Putting the **guest first** anchors the guest's own
  outfit + pose as the scene; style is demoted to the last slot.
- **Style ref = a single-FIGURE swatch (`SF_style_swatch.png`), NOT the full `SF.jpeg` poster.**
  The full poster leaks its people/outfits into the output. A small single-figure swatch in the
  **last** slot conveys the render style without contributing a scene. (`SF.jpeg` remains the
  source the swatch was cropped/derived from; the swatch is the thing actually passed to klein.)
- **Kelvin's fixed appearance PINNED in the prompt** (e.g. "black hair, navy tuxedo") in
  addition to `mr_kelvin_real.jpg` — keeps him consistent poster-to-poster.
- **Acceptance criteria all PASS:** guest outfit + pose preserved; **Kelvin pose adapts**
  (arm-around-shoulder + matching thumbs-up); Kelvin identity correct; **skin tone NOT
  whitened (dark-skin test stays brown — the #1 regression is GONE)**; bobblehead style; slim
  bodies; latency ≤30 s.

**Still required to satisfy this contract's OUTPUT format** (the validated images are raw /
pre-matte): after generation, **matte to transparent RGBA** (rembg / human-seg) and **reframe
to the canonical 1280×1024** (feet near bottom, pair centered), then return `{image,…}`. Wire
this recipe **behind the existing live `/avatar/generate`** so the bridge needs zero changes.

**Open polish (NOT blockers for wiring the endpoint; fix before event go-live):**
1. **Beard hallucinated** on clean-shaven / female faces (goatee appears). Add a prompt guard
   ("keep clean-shaven if the guest is clean-shaven; add no facial hair") and/or raise
   guest-identity weight.
2. **Skin tone fine-tuning** — lighter-skinned guest (mr.ko) came out a touch too brown (no
   whitening, just not exact). Minor.

## What to generate

- **Input:** guest full-body photo (multipart `photo`) — unchanged. Exactly one person expected,
  **in whatever pose they chose** — no longer assumed neutral/standing.
- **Kelvin — identity:** `mr_kelvin_real.jpg` (a real candid photo, not stylized). Treat this as
  an identity reference exactly like the guest's photo — derive his actual likeness (face, hair,
  build) from it, not his pose (he's not neutrally standing in that photo either; ignore its pose).
- **Style:** `SF.jpeg` — the single pinned style reference for the whole output (big-head 3D
  caricature "bobblehead" render, lighting, rendering quality — see the Style section below).
- **Composition — POSE-ADAPTIVE (the core ask):** ONE image, **GUEST on the LEFT**, **KELVIN on
  the RIGHT**, standing close together like they're genuinely posing for a photo together. The
  guest keeps whatever pose/gesture they struck in their photo. **Kelvin's pose is generated to
  react to and complement it** — mirrror the gesture, or a natural paired reaction to it (arm
  around shoulder, matching gesture, looking at the guest or at camera depending on what fits).
  Same lighting, same ground line, both head-to-feet — so it reads as one real photo, not a
  template with two people dropped in.

  How you derive "what pose is the guest making" and generate a matching Kelvin pose is your
  call. The likely path is strong prompt instruction on a multi-reference-capable model (e.g.
  "study the guest reference image's pose/gesture, generate Kelvin performing a matching or
  complementary pose/gesture, both otherwise per the style reference") — this depends on the
  model's instruction-following being good enough to read and react to an arbitrary pose per
  request. If that proves inconsistent in testing, the fallback is an explicit pose-estimation
  step (extract the guest's pose/hand keypoints, generate Kelvin conditioned to match/complement
  them) for reliability. Pick whichever gets consistent results — this contract cares about the
  output, not the internal method.

## Output format (hard contract — the bridge composites this as-is, unchanged)

- **Transparent-background RGBA PNG.** No baked background, text, or logos — the bridge owns those
  (fixed stadium `bg.png`, title/caption, SNS logo).
- **Canonical canvas: 1280 × 1024.** Both people **head-to-feet**, **feet near the bottom edge**,
  the **pair centered horizontally**, and **consistent framing every render** so the bridge can
  drop it into one fixed slot regardless of what pose they're striking.
- Wire format unchanged: `200 → { "image": "<base64 PNG RGBA>", "width", "height", "seed", "ms" }`.

## Style — pinned reference

- **`SF.jpeg`** is the master style target: big-head 3D caricature ("bobblehead") — exaggerated
  oversized head (~⅓–⅖ of total height) on a smaller, slim body; glossy Pixar/collectible-figurine
  render; soft studio-quality lighting; realistic detailed faces that clearly read as the specific
  people. Match this look for **both** figures — use it as an actual image reference wherever your
  pipeline supports multi-image conditioning, not just a text description of it.

## Identity — still-open fixes, apply to the GUEST (and now verify on Kelvin's real-photo path too)

- **Skin tone & ethnicity MUST be preserved.** A dark-skinned (Black) guest previously came out
  **light-skinned/white** — unacceptable. Raise ID/identity weight, add explicit skin-tone +
  ethnicity descriptors from the input face, and **negative-prompt against skin lightening /
  "beautifying" / Euro-centric defaults**. Verify on dark-skinned test faces specifically.
- **Slim / proportionate body — not overweight.** Guests previously came out **fat**. Keep the
  exaggerated *head* but negative-prompt "overweight, obese, bloated, chubby body".
- Preserve hair, glasses, facial hair, and visible outfit colors as faithfully as the style allows,
  for both the guest and Kelvin.

## QC / errors (unchanged)

- Require **exactly one detectable person in the guest photo** → `422` otherwise (message safe to
  show the attendee, e.g. "No full-body person detected. Stand back so your whole body is in
  frame." / "Multiple people detected. One person per photo."). Any pose is acceptable — QC is
  about person-count/framing, not pose. The **output always includes Kelvin** regardless.
- Keep `400` (decode/unknown style), `413` (>15 MB), `503` (busy), `500` (failure).
- Latency budget unchanged (~≤30 s target; the bridge waits up to 120 s).

## Suggested test set before calling this done

A handful of guest photos in **deliberately different poses** (thumbs up, peace sign, arms
crossed, one arm raised, mid-laugh) to confirm Kelvin's pose actually adapts per-photo rather than
collapsing back to one default stance regardless of input — that consistency is the whole point of
this update.
