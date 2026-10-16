# Premade effects and styles

Open `/{locale}/presets` from the studio navigation. The gallery contains45distinct entries captured from Higgsfield’s public Effects catalog on16October2026, deduplicated by their public preset slugs. Public example pictures appear beside independently authored Highfield prompt interpretations. Pick a card, adjust optional prompt direction/intensity, then open a draft in the existing image/video composer. Attach your own image, choose a reference-compatible model and deliberately press Generate. The public example picture is never used automatically as generation input.

These are **not the original proprietary effect recipes**. Mixed-media still-image adaptations are explicitly labeled single-frame interpretations. Prompt intensity is text guidance, not a claimed native model control. Model quality, input support, quotas and provider charges remain the chosen provider’s responsibility. The original hosted Higgsfield preset is linked separately and may require its own account/credits. Native Genjutsu models in the video studio still require the optional Higgsfield connection and a source video plus reference image(s).

Provider credentials belong in `/{locale}/connections`. For native Higgsfield APIs, paste the complete copied API credential into the Higgsfield field; do not paste browser session cookies. Credentials remain server-side and are never attached to showcase-image requests.

## Example artwork storage

The public metadata and our prompt interpretations are in `src/content/effect-presets.json`. Source artwork is **not assumed to be MIT licensed**, is not attributed as our generated work, and is not committed to the public fork. At the owner’s request, public examples are cached privately under `STUDIO_SETTINGS_DIR/preset-previews` (directory0700, files0600), with source/cached checksums in a private manifest. Do not republish third-party artwork without the required rights.

Run `npm run cache:presets` explicitly with the correct private settings directory to download these finite public URLs. The cache accepts only the fixed public CDN host, rejects redirects and non-image MIME types, caps transfers at4MiB and decoded input at20MP, emits thumbnails no larger than768×1024/512KiB, never sends provider credentials, and atomically replaces only its own files. There is no arbitrary URL proxy or download-on-GET endpoint. `GET /api/presets/preview/:id` serves only known IDs from that cache, with no-follow file opens and private cache headers. Missing/corrupt examples show a fallback while the draft remains usable.

Metadata can be rebuilt from a reviewed public-page capture with `node scripts/build-effect-catalog.mjs /path/to/capture.json`; each record contains only `id`, `name`, `image` and `source`. The builder requires all45known slugs and approved queryless public image/source URLs. `scripts/preset-instructions.mjs` contains our original interpretations, not imported private prompt content.

`npm run test:presets` tests metadata/draft constraints, reference requirements, cache-only HTTP serving, invalid paths/content/symlinks, private modes and an offline downloader fixture that forbids authorization/cookie forwarding. It does not establish generation fidelity or perform any paid inference.
