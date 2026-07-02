# Z-Image style test (run on the GPU baremetal host, not this bridge box)

Quick feasibility test for using [Z-Image](https://github.com/Tongyi-MAI/Z-Image) /
Z-Image-Turbo to hit the SF.jpeg ("It All Starts Here") caricature-figure look. **Do not
run this on the Apache/bridge box** — no GPU there, and disk is at 98% full. Copy this
folder + `../SF.jpeg` to the GPU host and run it there, next to the existing PuLID-FLUX
avatar setup (see `../avatar-gen-contract.md`).

## Reality check before you run this

Z-Image's released pipeline (`ZImagePipeline` in diffusers) is **text-to-image only** —
it does not take a reference image. `Z-Image-Edit`, which would accept an image +
instruction, is marked **"To be released"** in the upstream repo as of this writing. So
this test does **not** feed `SF.jpeg` to the model directly; it tests the style via a
hand-written text prompt (`style_prompt.txt`) distilled from looking at SF.jpeg. It also
has **no identity-preservation** — don't expect a specific person's face; it's a pure
style/quality check.

If the style comes out close and you want actual per-guest identity + this style
combined, the realistic next steps are:
- **LoRA fine-tune** Z-Image on a handful of images in this style (DiffSynth-Studio
  supports LoRA training for Z-Image) — moderate effort, most control.
- **Wait for `Z-Image-Edit`** once released, then re-evaluate image+instruction editing.
- Or keep the current PuLID-FLUX pipeline (already identity-preserving) and just tighten
  its style prompt/LoRA toward the SF.jpeg look instead of switching models.

## Run it

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install git+https://github.com/huggingface/diffusers torch accelerate safetensors
python try_zimage_turbo.py                    # default seed 42
python try_zimage_turbo.py --seed 7 --out v2.png
```

First run downloads the Z-Image-Turbo checkpoint from Hugging Face (multi-GB, several
safetensors shards) — make sure the GPU host has space and VRAM headroom (Turbo fits in
16GB VRAM per the upstream README). Output is a PNG saved next to the script; pull it
back and compare against `SF.jpeg` for style fidelity before deciding whether to invest
further.

Edit `style_prompt.txt` freely and re-run to iterate on the wording — no code changes
needed.
