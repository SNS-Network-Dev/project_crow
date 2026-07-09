# Project Crow — Evaluate FLUX.2 [klein] for avatar generation

> **Audience:** whoever operates the GPU baremetal host (`103.47.130.195`). This is an
> **evaluation task**, not a locked contract — goal is to find out whether swapping the
> generation core from PuLID-FLUX (FLUX.1-dev) to FLUX.2 [klein] fixes the three open bugs
> in `avatar-gen-contract.md` (style mismatch, skin-tone bug, body-shape bug) by using real
> **image references** instead of text-prompt-only conditioning. If it works, fold the
> winning recipe back into `avatar-gen-contract.md` as the new implementation. Until then,
> **keep the current PuLID-FLUX `/avatar/generate` endpoint running** — this is a parallel
> experiment, not a cutover.

## Why this might be a real fix, not just a different model

The bridge currently sends one guest photo and hopes the GPU pipeline's text-prompt style
description gets the "big-head bobblehead caricature" look right. That approach is why the
style/skin-tone/body-shape bugs exist — the model has no actual picture of the target style
or of Mr Kelvin, only words. **FLUX.2 [klein] supports multi-reference image editing**: you
pass a **list of images** (not just text) into one call, and it composes/edits using all of
them as visual grounding. Confirmed from the real `diffusers` source
(`pipeline_flux2_klein.py`, `Flux2KleinPipeline.__call__`):

```python
image: list[PIL.Image.Image] | PIL.Image.Image | None = None
```

So instead of describing the style in words, we can hand it the actual pixels:
- **`SF.jpeg`** (`/var/www/project_crow/SF.jpeg`) — the master **style** reference (exact
  big-head 3D caricature look, lighting, rendering quality).
- **`mr_kelvin_real.jpg`** (`/var/www/project_crow/mr_kelvin_real.jpg`) — a **real, unstylized**
  candid photo of Kelvin. This is his **identity** reference, same role as the guest's photo —
  not a style source, and not a pose source either (ignore his pose in that photo).
- **the guest's uploaded photo** — the person whose skin tone, ethnicity, and body shape must be
  preserved (this is exactly the part that's been failing), **in whatever pose they chose**.

One call, three image inputs, one prompt describing the composition. This directly targets all
three open bugs at once — real pixels for style instead of adjectives, a real photo of the guest
for identity instead of relying on ID-embedding weights that have shown bias, and now a real
photo of Kelvin too (previously a stylized cutout was reused as his identity source, which is a
weaker signal than an actual photo).

**Updated goal as of `avatar-gen-contract.md` V2 (2026-07-02): the pose is no longer fixed.**
The guest poses however they want (thumbs up, peace sign, whatever) and **Kelvin's generated pose
must react to / match the guest's**, so it reads as a genuine candid photo of the two of them
together — not a template. This is exactly the kind of thing multi-reference + strong
instruction-following is worth testing for: a prompt that says "read the guest reference's
pose/gesture and have Kelvin respond with a matching or complementary one" is a natural fit for a
model whose whole pitch is instruction adherence across multiple image inputs. If that's not
reliable enough in testing, the fallback is explicit pose-estimation on the guest photo (keypoints
in, matching pose out) — see `avatar-gen-contract.md` for the full spec of this requirement.

## Model choice + licensing (read before downloading anything)

| Model | Multi-reference | VRAM (BFL's own figures) | License |
|---|---|---|---|
| **FLUX.2 [klein] 9B** | ✅ | ~29 GB | FLUX Non-Commercial |
| **FLUX.2 [klein] 9B KV** | ✅ (fastest at multi-reference, via KV caching) | ~29 GB class | FLUX Non-Commercial |
| FLUX.2 [klein] 4B | ✅ | ~8 GB | **Apache-2.0** (commercial-safe) |

**Use `FLUX.2-klein-9B-KV` as the primary candidate** — best quality-to-latency ratio for
multi-reference editing specifically, per BFL's own recommendation. This carries the same
**FLUX Non-Commercial License** class as the FLUX.1-dev/PuLID pipeline already running on
this box, so it's the same licensing posture already in effect for this project — not a new
category of risk. **`FLUX.2-klein-4B` (Apache-2.0) is the fallback** if non-commercial
licensing ever becomes a blocker for this event/deployment — lower VRAM ceiling and likely
somewhat lower quality, but fully commercial-safe. Worth a quick side-by-side if time allows,
but don't let it block starting the 9B-KV evaluation.

Both are **gated on Hugging Face** — before downloading, accept the license on the model
page (e.g. `https://huggingface.co/black-forest-labs/FLUX.2-klein-9b-kv`) while logged in,
then `huggingface-cli login` / set `HF_TOKEN` on the GPU host so `from_pretrained(...)` can
fetch the weights.

**Before pulling weights:** confirm actual free VRAM/disk on the GPU host first (`nvidia-smi`,
`df -h`) — I don't have shell access there to check this myself. FLUX.1-dev is already
resident for PuLID, so there should be headroom, but verify rather than assume.

## Integration recipe

Keep the **exact same endpoint contract** from `avatar-gen-contract.md` — this is purely an
internal swap of what generates the figure(s). The bridge (`generateAvatar()` in
`frontend/lib/baremetal.ts`, `app/api/avatar/route.ts`) needs **zero changes** if the output
still matches:

```
200 → { "image": "<base64 PNG, RGBA, transparent bg>", "width", "height", "seed", "ms" }
```

### 1. Reference images

```python
from diffusers.utils import load_image

style_ref  = load_image("SF.jpeg")            # exact art style + rendering target ONLY
kelvin_ref = load_image("mr_kelvin_real.jpg") # Kelvin's identity ONLY (real photo, ignore its pose)
guest_ref  = load_image(guest_photo_path)     # the uploaded guest photo — identity AND pose source
```

### 2. Prompt (pose-adaptive composition — the images carry style/identity, the prompt carries the arrangement + the pose-matching instruction)

```
Recreate the exact 3D caricature "bobblehead" art style, lighting, and rendering quality of
the style reference image, for both people. Use the Kelvin reference image only for his facial
identity, hair, and build — ignore his pose in that photo. Use the guest reference image for
the guest's facial identity, skin tone, ethnicity, and build, AND for the pose/gesture to keep:
whatever the guest is doing in their photo (thumbs up, peace sign, arms crossed, etc.), preserve
it exactly. Generate Kelvin's pose to react to and match the guest's gesture — mirror it, or a
natural complementary reaction to it — so the two look like they are genuinely posing for a
photo together in that moment, not standing in a generic template pose. Guest on the LEFT,
Kelvin on the RIGHT, standing close together, same ground line, same lighting, both head to
feet. Preserve the guest's true skin tone and ethnicity — do not lighten skin, do not change
ethnicity. Keep both bodies slim/proportionate, not overweight — exaggerate only the heads.
Plain neutral background, full body, feet visible, no text, no logos, no watermark.
```
Iterate wording against real output — this is a first draft, not tuned. The pose-matching
instruction (paragraph 2) is the riskiest part to get consistent; test across several guest
poses (see the eval protocol below) before trusting it.

### 3. Generate

```python
import torch
from diffusers import Flux2KleinPipeline

pipe = Flux2KleinPipeline.from_pretrained(
    "black-forest-labs/FLUX.2-klein-9b-kv",
    torch_dtype=torch.bfloat16,
)
pipe.enable_model_cpu_offload()  # drop if VRAM headroom allows keeping it all on-GPU

result = pipe(
    image=[style_ref, kelvin_ref, guest_ref],
    prompt=prompt,
    height=1024,
    width=1280,          # match the bridge's canonical pair canvas (1280x1024 landscape)
    guidance_scale=1.0,  # klein is guidance-distilled; start near 1.0, tune from there
    num_inference_steps=4,  # step-distilled default; raise if quality needs it
    generator=torch.Generator("cuda").manual_seed(seed),
).images[0]
```

### 4. Cut alpha (still required — diffusion output is flat RGB, no native transparency)

FLUX.2 does not output an alpha channel any more than FLUX.1 did. Reuse whatever
human-segmentation step the current PuLID pipeline already uses (per the bridge's notes:
"rembg human-seg for true alpha") on `result` before returning it, so the bridge can
composite it onto the stadium background exactly as it does today. Generate against a
plain/neutral background in the prompt (as above) to make segmentation clean.

### 5. QC (unchanged from `avatar-gen-contract.md`)

Still only the **guest photo** needs the one-person full-body check → `422` with the same
messages on failure. Kelvin and style come from fixed references, so they can't fail QC.

## Evaluation protocol before cutting over

1. Run a small test set through the recipe above, including **at least one dark-skinned
   test face** — this is the exact case that broke on the current pipeline. Confirm skin
   tone/ethnicity is preserved, not lightened.
2. Check body proportions come out slim/caricature, not inflated.
3. Compare style fidelity against `SF.jpeg` side by side with current PuLID-FLUX output.
4. **Pose-adaptivity test (the new core requirement):** run the **same guest photo concept in
   several different poses** — thumbs up, peace sign, arms crossed, one arm raised, mid-laugh —
   and confirm Kelvin's generated pose actually changes to react/match each one. If Kelvin comes
   out in the same default stance regardless of the guest's pose, the prompt-only approach isn't
   working and needs the pose-estimation fallback noted above.
5. Check latency — 9B-KV should stay well within the bridge's 120s timeout; ideally close to
   BFL's sub-second class figures once weights are warm, but real end-to-end (segmentation +
   encode) will be higher than their raw benchmark.
6. If it clearly beats the current pipeline on all criteria, fold this into
   `avatar-gen-contract.md` as the real implementation and retire the PuLID-only path. If
   licensing is a concern by then, re-run the same evaluation against `FLUX.2-klein-4B`
   before deciding.
