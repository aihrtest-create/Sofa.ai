import test from "node:test";
import assert from "node:assert/strict";
import {
  CAMERA_RECIPES,
  buildContactSheetPrompt,
  buildPreviewFinalizePrompt,
  buildSofaPrompt,
  getCamerasForShotSet,
} from "./prompts.js";

test("prompt locks sofa identity and requests photographic realism", () => {
  const prompt = buildSofaPrompt({ sceneId: "studio", angle: CAMERA_RECIPES.hero });
  assert.match(prompt, /sole source of truth/i);
  assert.match(prompt, /exact same physical product/i);
  assert.match(prompt, /fabric color, weave/i);
  assert.match(prompt, /never an AI render/i);
  assert.match(prompt, /exactly one sofa/i);
  assert.match(prompt, /50mm full-frame lens/i);
  assert.match(prompt, /never mirror a cushion/i);
  assert.match(prompt, /CAMERA ORBIT LOCK/i);
  assert.match(prompt, /SHOT DIFFERENTIATION LOCK/i);
  assert.match(prompt, /MATERIAL CONTINUITY LOCK/i);
  assert.match(prompt, /SECTION GEOMETRY LOCK/i);
  assert.match(prompt, /Do not force the sofa into equal catalog thirds/i);
  assert.match(prompt, /LEG AND FOOTPRINT LOCK/i);
  assert.match(prompt, /Never replace them with generic wooden/i);
});

test("follow-up prompt prevents generated identity anchors from copying composition", () => {
  const prompt = buildSofaPrompt({
    sceneId: "light",
    angle: CAMERA_RECIPES.front,
    hasConsistencyAnchor: true,
  });
  assert.match(prompt, /generated identity reference/i);
  assert.match(prompt, /Do not copy its camera angle, crop, room layout, sofa placement or composition/i);
  assert.match(prompt, /user-uploaded reference images remain the highest authority/i);
});

test("ugc apartment prompt separates product and room references", () => {
  const prompt = buildSofaPrompt({
    sceneId: "ugcApartmentWindow",
    angle: CAMERA_RECIPES.hero,
    productReferenceCount: 2,
    roomReferenceCount: 2,
  });
  assert.match(prompt, /Images 1-2 are user-uploaded product references/i);
  assert.match(prompt, /internal image references show only the room/i);
  assert.match(prompt, /Never copy or infer sofa design/i);
  assert.match(prompt, /iPhone\/UGC apartment photograph/i);
  assert.match(prompt, /26-28mm smartphone lens/i);
  assert.match(prompt, /iPhone\/UGC realism must not be achieved by narrowing/i);
});

test("single-shot text-only background never describes room references as inputs", () => {
  const prompt = buildSofaPrompt({
    sceneId: "ugcApartmentWindow",
    angle: CAMERA_RECIPES.hero,
    productReferenceCount: 2,
    roomReferenceCount: 0,
    textOnlyBackground: true,
  });
  assert.match(prompt, /TEXT-ONLY BACKGROUND/i);
  assert.match(prompt, /No room or background reference images are provided/i);
  assert.doesNotMatch(prompt, /shown in the internal room reference images/i);
  assert.doesNotMatch(prompt, /The next \d+ internal image reference/i);
});

test("adaptive scene chooses a suitable room without changing the sofa", () => {
  const prompt = buildSofaPrompt({
    sceneId: "auto",
    angle: CAMERA_RECIPES.hero,
    productReferenceCount: 1,
    textOnlyBackground: true,
  });
  assert.match(prompt, /Choose one coherent, commercially useful residential interior/i);
  assert.match(prompt, /style, proportions, upholstery color/i);
  assert.match(prompt, /without recoloring, restyling/i);
});

test("revision note is secondary to product fidelity locks", () => {
  const prompt = buildSofaPrompt({
    sceneId: "light",
    angle: CAMERA_RECIPES.front,
    productReferenceCount: 1,
    textOnlyBackground: true,
    revisionNote: "Make the room warmer and keep more space above the sofa.",
  });
  assert.match(prompt, /OPERATOR CORRECTION/i);
  assert.match(prompt, /Make the room warmer/i);
  assert.match(prompt, /never let it override PRODUCT IDENTITY/i);
  assert.match(prompt, /original user product references/i);
});

test("ugc herringbone living prompt preserves room identity and reference roles", () => {
  const prompt = buildSofaPrompt({
    sceneId: "ugcHerringboneLiving",
    angle: CAMERA_RECIPES.hero,
    productReferenceCount: 3,
    roomReferenceCount: 2,
  });
  assert.match(prompt, /Images 1-3 are user-uploaded product references/i);
  assert.match(prompt, /internal image references show only the room/i);
  assert.match(prompt, /iPhone\/UGC apartment photograph/i);
  assert.match(prompt, /26-28mm smartphone lens/i);
  assert.match(prompt, /herringbone parquet/i);
  assert.match(prompt, /two framed posters/i);
  assert.match(prompt, /Never copy or infer sofa design/i);
});

test("depth camera is an orbiting profile, not a pure side view", () => {
  const prompt = buildSofaPrompt({ sceneId: "ugcApartmentWindow", angle: CAMERA_RECIPES.depth });
  assert.match(prompt, /not a pure side view/i);
  assert.match(prompt, /not the same as Hero/i);
  assert.match(prompt, /sofa footprint/i);
  assert.match(prompt, /without moving the sofa forward/i);
});

test("detail, elevated and room recipes force distinct compositions", () => {
  assert.match(buildSofaPrompt({ sceneId: "ugcApartmentWindow", angle: CAMERA_RECIPES.detail }), /not a full sofa view/i);
  assert.match(buildSofaPrompt({ sceneId: "ugcApartmentWindow", angle: CAMERA_RECIPES.elevated }), /visible top surfaces/i);
  assert.match(buildSofaPrompt({ sceneId: "ugcApartmentWindow", angle: CAMERA_RECIPES.room }), /widest shot in the set/i);
});

test("ugc herringbone depth keeps the room fixed while orbiting", () => {
  const prompt = buildSofaPrompt({ sceneId: "ugcHerringboneLiving", angle: CAMERA_RECIPES.depth });
  assert.match(prompt, /not a pure side view/i);
  assert.match(prompt, /sofa footprint/i);
  assert.match(prompt, /poster position/i);
  assert.match(prompt, /lamp position/i);
  assert.match(prompt, /without sliding the sofa forward/i);
});

test("shot sets resolve to quick and full camera storyboards", () => {
  assert.deepEqual(getCamerasForShotSet("quick").map((camera) => camera.id), [
    "hero",
    "front",
    "depth",
    "detail",
  ]);
  assert.deepEqual(getCamerasForShotSet("full").map((camera) => camera.id), [
    "hero",
    "front",
    "depth",
    "detail",
    "elevated",
    "room",
  ]);
});

test("contact sheet prompt is explicitly preview-only and crop-safe", () => {
  const prompt = buildContactSheetPrompt({
    sceneId: "ugcApartmentWindow",
    shotSetId: "full",
    productReferenceCount: 1,
    roomReferenceCount: 2,
  });
  assert.match(prompt, /preview contact sheet collage/i);
  assert.match(prompt, /not the final customer export/i);
  assert.match(prompt, /exact 3 columns by 2 rows/i);
  assert.match(prompt, /no text, no labels/i);
  assert.match(prompt, /Depth/i);
  assert.match(prompt, /Elevated/i);
  assert.match(prompt, /Room/i);
  assert.match(prompt, /narrow-left \/ wide-center \/ narrow-right/i);
  assert.match(prompt, /not at one-third and two-thirds/i);
  assert.match(prompt, /LEG AND FOOTPRINT LOCK/i);
  assert.match(prompt, /sofa movement/i);
});

test("preview finalization locks selected frame while preserving product legs", () => {
  const prompt = buildPreviewFinalizePrompt({
    sceneId: "ugcHerringboneLiving",
    angle: CAMERA_RECIPES.front,
    productReferenceCount: 2,
    roomReferenceCount: 2,
  });
  assert.match(prompt, /selected preview storyboard frame/i);
  assert.match(prompt, /Image 5 is the selected preview storyboard frame/i);
  assert.match(prompt, /locked visual composition/i);
  assert.match(prompt, /visible leg design/i);
  assert.match(prompt, /Back cushions and lower\/base modules may have different counts/i);
  assert.match(prompt, /Never replace them with generic wooden/i);
  assert.match(prompt, /keep the preview composition but correct the product detail/i);
});
