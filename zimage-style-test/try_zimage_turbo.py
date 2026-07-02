"""
Quick style test for Z-Image-Turbo (https://github.com/Tongyi-MAI/Z-Image), run on the
GPU baremetal host — NOT the bridge box (no GPU / disk there).

Z-Image's released pipeline is TEXT-TO-IMAGE ONLY: it does not accept a reference image
(no IP-Adapter/ControlNet-style conditioning in the base repo). Z-Image-Edit, which WOULD
take an image + instruction, is listed in the repo as "To be released" — not out yet.
So this script tests the SF.jpeg style via a distilled TEXT PROMPT (style_prompt.txt),
not by feeding SF.jpeg in directly. Treat this as a feasibility check on style/quality,
not identity preservation — Z-Image-Turbo has no notion of "this specific person's face."

Usage (on the GPU host, in a venv with diffusers installed from source per the Z-Image
README):
    pip install git+https://github.com/huggingface/diffusers torch accelerate
    python try_zimage_turbo.py
    python try_zimage_turbo.py --seed 7 --out variant2.png
"""

import argparse
from pathlib import Path

import torch
from diffusers import ZImagePipeline

HERE = Path(__file__).parent


def load_prompt() -> tuple[str, str]:
    text = (HERE / "style_prompt.txt").read_text()
    prompt, _, negative = text.partition("Negative prompt:")
    return prompt.strip(), negative.strip()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--steps", type=int, default=9, help="9 -> 8 DiT forwards, per Turbo docs")
    ap.add_argument("--width", type=int, default=1280)
    ap.add_argument("--height", type=int, default=1024)
    ap.add_argument("--out", default="zimage_style_test.png")
    args = ap.parse_args()

    prompt, negative_prompt = load_prompt()
    print("PROMPT:", prompt[:120], "...")

    pipe = ZImagePipeline.from_pretrained(
        "Tongyi-MAI/Z-Image-Turbo",
        torch_dtype=torch.bfloat16,
        low_cpu_mem_usage=False,
    )
    pipe.to("cuda")

    image = pipe(
        prompt=prompt,
        negative_prompt=negative_prompt,
        height=args.height,
        width=args.width,
        num_inference_steps=args.steps,
        guidance_scale=0.0,  # Turbo models want CFG 0
        generator=torch.Generator("cuda").manual_seed(args.seed),
    ).images[0]

    out_path = HERE / args.out
    image.save(out_path)
    print("saved:", out_path)


if __name__ == "__main__":
    main()
