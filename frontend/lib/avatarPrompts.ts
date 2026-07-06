// The baremetal house-default prompts, copied verbatim from AVATAR_API_HANDOFF.md.
// Used ONLY by the Booth-control UI's "Load default to edit" buttons — the bridge
// never sends these automatically. When an override is left BLANK, no `prompt`/
// `pair_prompt` is sent and baremetal uses its own live default (so these staying
// in sync with baremetal only matters for the editing convenience, not generation).
//
// `{gesture}` is replaced by baremetal with the pose its vision model detects.

/** /kelvin + /group figurine-conversion stage (the pose-aware variant, has {gesture}). */
export const DEFAULT_PROMPT = `Turn this exact person into a premium 3D collectible caricature figurine with a natural, well-proportioned body and only a SUBTLY enlarged head (about one quarter of total height, NOT a big-head bobblehead). Glossy smooth, highly detailed, sharp render, soft studio lighting. Keep their EXACT face, skin tone, ethnicity, hairstyle and their own clothing. Do NOT add glasses or a beard unless they already have them. IMPORTANT POSE: the figurine is {gesture}. The figurine FACES THE CAMERA directly, front-facing, looking straight ahead. Full body head to feet, plain light-grey background.`;

/** /kelvin guest+Kelvin combine stage (the pose-following variant, has {gesture}). */
export const DEFAULT_PAIR_PROMPT = `The two reference images each show one premium 3D collectible caricature figurine. Combine BOTH into a single sharp high-resolution photo posing together for one friendly candid photo: the FIRST person on the LEFT, the SECOND man (Kelvin) on the RIGHT. BOTH figures must have the SAME body proportions and the SAME subtly-enlarged head size — do NOT make the left person's head bigger than the right person's; match their head sizes. The FIRST person (the guest) is {gesture} — keep that exact pose. Generate Kelvin's gesture to REACT TO and COMPLEMENT the guest — mirror it, do a matching gesture, or a natural paired reaction — so they look like they are genuinely posing together in that moment. BOTH figures FACE THE CAMERA directly, bodies and faces turned to the front, looking straight ahead at the viewer (do NOT turn them sideways or toward each other). Standing close on the same ground line, same soft studio lighting, plain light-grey background. Keep each person's exact face, hair, outfit and style from their own reference image. Both full body head to feet, feet visible, sharp glossy highly-detailed 3D render.`;

/** /group per-person figurine conversion. */
export const DEFAULT_GROUP_PROMPT = `Turn this exact person into a premium 3D collectible caricature figurine with a natural, well-proportioned body and only a SUBTLY enlarged head (about one quarter of total height, NOT a big-head bobblehead). Glossy smooth, highly detailed, sharp render, soft studio lighting. Keep their EXACT face, skin tone, ethnicity, hairstyle and their own clothing. Do NOT add glasses or a beard unless they already have them. IMPORTANT POSE: the figurine is {gesture}. The figurine FACES THE CAMERA, front-facing, looking straight ahead. Full body head to feet, standing, plain light-grey background.`;

export const PROMPT_MAX = 2000;
