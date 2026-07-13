# Sofa.ai Architecture Notes

This file is the handoff document for new chats and future work on this prototype. Read it before changing generation logic, UI flow, room presets, or fabric replacement.

## Product Shape

Sofa.ai / SOFA.SHOT is a local React + Express prototype for generating furniture photos from 1-6 user sofa references.

The intended product flow is one calm screen:

1. Upload 1-6 sofa reference images.
2. Choose an admin-curated room/background preset.
3. Choose a named shot set.
4. Optionally generate a cheaper preview contact sheet.
5. Finalize the selected preview frames with preview-lock, using preview tiles as composition anchors and product references as the sofa identity source.
6. Optionally replace upholstery fabric on the generated shots.
7. Show API cost and allow downloads.

Independent final reshoots still exist as a secondary fallback, but they are higher risk for leg/geometry drift than preview-locked finalization.

The UI should preserve the approved light editorial split-screen direction from `/Users/dima/Documents/Снимок экрана 2026-06-23 в 01.25.40.png`: warm ivory surfaces, serif display type, restrained oxblood accent, and a large photorealistic sofa image. Do not turn the product into a dashboard.

## Runtime

- App root: `/Users/dima/Documents/Sofa.ai`
- Frontend: React 19 + Vite.
- Server: Express 5 running in `server/index.js`.
- OpenAI client: `openai` npm package.
- Local dev URL: `http://127.0.0.1:5173`
- API key source: `.env.local` or `.env`, variable `OPENAI_API_KEY`.

Commands:

```bash
npm run dev
npm test
npm run build
```

Always run `npm test` and `npm run build` before handoff after code changes. Keep the local server bound to `127.0.0.1`.

## File Map

- `src/App.jsx`
  Main React UI, upload flow, room preset picker, shot set picker, preview contact-sheet UI, final results, fabric replacement UI, downloads, and demo states.

- `src/SingleShotApp.jsx`
  Separate `/single-shot` fidelity experiment: primary-reference selection, text-only background choice, one camera, one model, one independent result, refinement and local history.

- `src/singleShotHistory.js`
  Browser-only IndexedDB persistence for single-shot outputs, source references, generation settings, model cost totals and history cleanup.

- `src/styles.css`
  Editorial layout and responsive states. Keep changes restrained; avoid dashboard-like cards, gradients, analytics sections, and secondary navigation.

- `src/single-shot.css`
  Dedicated editorial split-screen styling for the single-frame experiment.

- `server/index.js`
  Express app, file upload validation, `/api/generate-frame`, `/api/generate`, `/api/contact-sheet`, `/api/finalize-preview`, `/api/qa-export`, `/api/reupholster`, Batch polling, Vite middleware in dev, static serving in production.

- `server/prompts.js`
  Room scene registry, camera recipes, prompt builders, product/room separation, camera locks, leg/footprint locks, material continuity locks, contact-sheet prompt, and preview-lock finalization prompt.

- `server/qa-export.js`
  Writes timestamped QA folders under `qa/generation/` without calling OpenAI.

- `scripts/export-preview-qa.mjs`
  Creates prompt-only or artifact-backed QA runs for Codex/chat simulation.

- `shared/shotSets.js`
  Canonical camera IDs and shot sets. This is the source of truth for `quick` and `full`.

- `shared/fabrics.js`
  Fabric preset metadata used by server-side upholstery prompts.

- `src/fabricPresets.js`
  Frontend mapping from fabric metadata to local swatch images.

- `server/reupholster.js`
  Fabric replacement prompt, synchronous editing, OpenAI Batch job creation, Batch hydration, and fabric input validation.

- `server/pricing.js`
  gpt-image-2 pricing snapshot and cost aggregation.

- `server/job-store.js`
  Local persistent job metadata for temporary Batch/fabric jobs.

- `src/assets/background-presets/`
  Admin-curated room reference assets. These are internal room/light/camera references, not product references.

- `src/assets/fabrics/`
  Generated or curated fabric reference swatches.

- `AGENTS.md`
  Durable prototype instructions and product decisions for Codex.

- `design-qa.md`
  Visual QA notes for the fabric replacement pass.

## Generation Modes

There are four image-generation paths.

### Experimental Single Frame

UI: `/single-shot`

Endpoint: `POST /api/generate-frame`

Purpose:
- Generate exactly one selected camera without a collage or preview-finalization stage.
- Compare A1/B1/C1 models quickly on the same product, room and camera.
- Make the primary product reference explicit by sending it first.
- Keep background preset cards as visual selectors while sending only their text descriptions to the model.
- Offer `Подобрать фон`, which lets the selected model choose a restrained residential environment from the product references and written constraints.
- Save successful generations and their source references locally so the operator can reopen, download or regenerate them.

Implementation:
- Multipart fields: `images` (1-6), `scene`, `camera`, `model`, optional `revisionNote` (up to 1000 characters).
- Camera must resolve through `CAMERA_RECIPES`.
- Each request calls only the selected provider once and returns one JSON result with image, model, scene, cost and QA metadata.
- `/api/generate-frame` never loads or sends `SCENES.referenceImages`, even if an older client sends `useRoomReferences=true`.
- UGC scenes use dedicated `textOnlyPrompt` descriptions so the prompt does not refer to missing internal images.
- Regeneration always starts from the original product references plus `revisionNote`; it never edits an already generated result.
- IndexedDB stores the result blob, original product files, primary index, scene, camera, model, note and returned cost. Clearing history removes those saved photos from the current browser.
- Mobile uses three focused steps: `Фото`, `Съёмка`, `Результат`; desktop keeps the editorial split-screen workspace.
- This is an experimental fidelity surface, not a replacement for the main customer workflow yet.

### Preview Contact Sheet

Endpoint: `POST /api/contact-sheet`

Purpose:
- Generate one cheaper preview collage/contact sheet.
- Frontend crops it into individual preview tiles using canvas.
- User can view larger preview tiles and download either the full collage or individual cropped preview frames.
- This is for selection/review only, not final customer export.

Implementation:
- Server calls `client.images.edit` with all user product references plus internal room references.
- Prompt comes from `buildContactSheetPrompt`.
- Uses the known grid from `shared/shotSets.js`.
- The frontend crops based on `grid.columns`, `grid.rows`, and `cells`.

Important rule:
- A contact sheet saves exploratory cost. When it looks good, prefer preview-locked finalization instead of independent reshooting.

### Preview-Locked Finalization

Endpoint: `POST /api/finalize-preview`

Purpose:
- Turn cropped preview tiles into final downloadable images.
- Preserve the selected preview's composition, camera, sofa placement, room continuity and visible leg placement.
- Use user product references as the higher authority for sofa identity, especially legs, seams, cushions, geometry and fabric.

Implementation:
- Multipart fields: `productImages` (1-6), `previewImages` (4 or 6), `scene`, `shotSet`, `previewMeta`.
- Server calls `client.images.edit` once per preview tile.
- Inputs per request are product references + internal room references + the selected preview tile.
- Prompt comes from `buildPreviewFinalizePrompt`.
- Uses `input_fidelity: "high"`, `quality: "medium"`, `size: "1536x1024"`, JPEG output.
- Returns the same NDJSON event shape as `/api/generate`.

### Final Shot Generation

Endpoint: `POST /api/generate`

Purpose:
- Generate final downloadable images as separate API calls, one per camera recipe.
- Stream progress as NDJSON.
- Emit each image as it completes.
- Return running API cost.

Implementation:
- Server uses `getCamerasForShotSet(shotSet.id)`.
- First selected camera is generated, then remaining cameras are generated with concurrency 2.
- Final images are generated from user product references + internal room references.
- Do not use a generated `Hero` image as a visual anchor for follow-up shots by default; it caused later shots to copy the same composition.
- Treat this path as "reshoot from scratch": useful as a fallback, but higher risk for leg, footprint and hidden-geometry drift.

NDJSON events:
- `started`: model, scene, shot set, count, quality, angles.
- `image`: one generated image plus running cost.
- `complete`: failed list, optional warning, total cost.
- `error`: terminal generation error.

## Shot Sets And Camera Recipes

Canonical source: `shared/shotSets.js`.

Shot sets:

- `quick`
  - UI: `Быстрый сет`
  - Count: 4
  - Cameras: `hero`, `front`, `depth`, `detail`
  - Grid: 2x2

- `full`
  - UI: `Полная съёмка`
  - Count: 6
  - Cameras: `hero`, `front`, `depth`, `detail`, `elevated`, `room`
  - Grid: 3x2

Camera recipes are defined in `server/prompts.js` as `CAMERA_RECIPES`.

Camera meanings:

- `hero`: primary front 3/4 selling angle.
- `front`: straight-on view, front plane mostly parallel to the camera.
- `depth`: orbiting profile 3/4, about 50-65 degrees, not a pure 90-degree side view.
- `detail`: true close crop on fabric, seams, arm, seat edge, and cushion junction.
- `elevated`: slightly elevated 3/4 with visible top surfaces of seats and arms.
- `room`: widest room-context shot, sofa smaller in frame.

Do not reintroduce a generic numeric output count as the primary UX. Use named shot sets.

## Prompt Architecture

Prompt building lives in `server/prompts.js`.

Core locks:

- `PRODUCT_LOCK`
  User-uploaded product images are the only sofa source of truth.

- `LEG_FOOTPRINT_LOCK`
  Sofa legs and floor contact are product identity. Do not invent generic legs or move the sofa footprint.

- `CAMERA_ORBIT_LOCK`
  The camera may move, but the sofa and room do not. This is especially important for `depth`.

- `SHOT_DIFFERENTIATION_LOCK`
  Hero, Front, Depth, Detail, Elevated and Room must be visually distinct.

- `MATERIAL_CONTINUITY_LOCK`
  The sofa upholstery material must stay consistent across the shot set.

- `REALISM_LOCK`
  Output should look photographic, never like a CGI render.

- `PREVIEW FRAME LOCK`
  Used by `buildPreviewFinalizePrompt`: preserve the selected preview frame's composition while improving final fidelity.

Room scenes can override camera prompts with `anglePrompts`. Use the same canonical keys: `hero`, `front`, `depth`, `detail`, `elevated`, `room`.

Important recent lesson:
- Passing a generated `Hero` image into later final-shot calls as an identity anchor made other shots copy the same angle. Avoid that unless a future experiment proves a safer identity-only anchor strategy.

## Room Presets

Room presets live in `SCENES` in `server/prompts.js` and are surfaced in `src/App.jsx`.

Each admin room preset should include:

- Stable `sceneId`.
- Russian UI name.
- One or more `referenceImages` under `src/assets/background-presets/`.
- Concise room identity prompt.
- Sofa placement rule.
- `anglePrompts` when default camera recipes need scene-specific UGC/smartphone language.

Existing UGC presets:

- `ugcApartmentWindow`
  Compact apartment with window, taupe curtains, ivory ribbed rug, pale oak floor, arched floor lamp, abstract wall art, and organic ceiling light.

- `ugcHerringboneLiving`
  Gray-beige herringbone living room with limewashed plaster wall, white baseboards, pale-oak herringbone floor, ivory patterned rug, taupe curtains at the left window, slim brass floor lamp, and two framed abstract posters.

Room reference assets should avoid sterile render-clean output. Use subtle iPhone/UGC realism: gentle highlight rolloff, mild phone/JPEG texture, slightly imperfect exposure and white balance, and softened CGI sharpness. Do not add a heavy degradation filter.

When creating a new room preset from interior photos, use the local skill:

`/Users/dima/.codex/skills/sofa-background-preset/SKILL.md`

New room presets should be internally QA-checked with storyboards:

- Quick-ready: `Hero`, `Front`, `Depth`, `Detail`.
- Full-ready: also `Elevated`, `Room`.
- Test across multiple sofa archetypes when practical.
- QA storyboards are admin validation assets, not final customer exports.

## Product-vs-Room Reference Separation

This is a hard boundary.

User uploads:
- Sofa/product references.
- Sole source of truth for sofa design, geometry, upholstery, seams, cushions, legs, and material.

Internal room references:
- Room identity, light, phone texture, composition, background geometry.
- Never source sofa design, cushions, legs, proportions, or upholstery.

`buildSofaPrompt` and `buildContactSheetPrompt` include role-map instructions when both product and room references are present.

## Fabric Replacement

Fabric replacement belongs inside the existing results section.

Flow:

1. User chooses a fabric preset.
2. App edits the primary generated shot synchronously.
3. User can apply to remaining shots immediately or via discounted Batch.
4. Fabric edits always start from the original generated shots, never from already edited variants.

Endpoints:

- `POST /api/reupholster`
  - `mode=sync`: stream edited images as NDJSON.
  - `mode=batch`: create an OpenAI Batch job.

- `GET /api/reupholster/jobs/:jobId`
  Poll and hydrate Batch results.

Fabric rules live in `server/reupholster.js`:

- Preserve composition, camera, sofa geometry, room, lighting, non-upholstered parts.
- Replace only upholstered textile surfaces.
- Use `shared/fabrics.js` traits and `src/assets/fabrics/*` visual references.

Current fabric validation allows 1-6 ready generated frames.

## Cost Accounting

Cost calculations live in `server/pricing.js`.

Pricing snapshot:
- Date: 2026-06-23
- Model: `gpt-image-2`
- Text input: `$5 / 1M`
- Image input: `$8 / 1M`
- Image output: `$30 / 1M`

The UI shows running API cost for generated images and fabric edits.

## Frontend State Notes

Important React state in `src/App.jsx`:

- `files`: user product references.
- `scene`: selected room preset.
- `shotSetId`: `quick` or `full`.
- `status`: final generation status.
- `result`: final generated shot data.
- `storyboardStatus`: preview contact-sheet status.
- `storyboard`: contact-sheet response plus cropped preview frames.
- `storyboardViewer`: current large preview frame.
- `generationMode`: `independent` or `preview-lock`.
- `qaStatus`, `qaExport`: local QA folder export state for preview/contact-sheet runs.
- `fabricStatus`, `fabricImages`, `fabricJob`: fabric replacement workflow.

Preview features:
- Generate contact sheet.
- Crop into tiles.
- View larger tile in lightbox.
- Download full collage.
- Download individual preview tile.
- Save contact sheet, cropped tiles, prompt metadata and cost metadata into `qa/generation/<timestamp>/`.

Final result features:
- Finalize selected preview tiles through preview-lock.
- Reshoot final images independently as a secondary fallback.
- Download each final generated image.
- Apply fabric changes to generated final images.

## Validation And QA

Required after implementation changes:

```bash
npm test
npm run build
```

For UI changes:
- Start `npm run dev`.
- Open `http://127.0.0.1:5173` in the in-app browser.
- Check desktop and mobile layout for text clipping and overlap.

For generation changes:
- Check server logs for OpenAI request errors.
- Confirm failures produce visible UI errors or failed placeholders.
- Avoid silent eternal loading.
- Confirm preview-lock keeps selected preview composition and does not invent or vary legs.

For QA export changes:
- Run `npm run qa:export -- --source codex-simulation --scene ugcHerringboneLiving --shot-set quick`.
- Confirm `qa/generation/<timestamp>/manifest.json`, `REVIEW.md`, and prompt files are created without an OpenAI API call.

For room preset changes:
- Confirm UI card appears.
- Confirm `server/prompts.test.js` has reference-role assertions.
- Confirm `depth` does not move the sofa forward or become a pure side reconstruction.

## Known Risks

- Contact-sheet preview can be cheaper, but one collage may still be a heavy OpenAI request and can timeout.
- Chat/Codex image generation can simulate prompt sequence and visual QA cheaply, but it is not production proof because the runtime Image API request, parameters, moderation behavior, streaming and cost accounting differ.
- Final shots generated independently may improve camera diversity but can still drift in upholstery texture; `MATERIAL_CONTINUITY_LOCK` exists to reduce this.
- Independent final shots can still invent legs or move the sofa. Prefer preview-lock when preview is already acceptable.
- `Depth` is intentionally not a true 90-degree side view unless the user supplies strong side references.
- Some hidden sofa geometry is unknowable from one frontal reference; prompts should choose the least inventive physically plausible continuation.
- `moderation: "auto"` is safety moderation only, not product-fidelity QA.
- UGC realism should not degrade images into blurry/noisy output. It should only avoid sterile CGI cleanliness.

## Working Principles

- Keep the product flow simple and single-screen.
- Treat competition/complexity in generation as product constraints, not reasons to add dashboard controls.
- Prefer named product modes over raw numeric options.
- Keep room presets admin-curated.
- Prefer preview-locked finalization after a good contact sheet; use independent final generation only as a fallback.
- Preserve sofa identity over decorative scene beauty.
- Preserve room continuity without using room references as sofa references.
