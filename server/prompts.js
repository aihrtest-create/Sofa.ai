import { getShotSet } from "../shared/shotSets.js";

export const SCENES = Object.freeze({
  auto: {
    name: "Подобрать фон",
    prompt: `Choose one coherent, commercially useful residential interior for the exact sofa shown in the user product references. Infer the most suitable room scale, architectural character, material palette and daylight mood from the sofa's real style, proportions, upholstery color and intended market position. The room must complement the product without recoloring, restyling or visually overpowering it. Keep the setting attainable, photorealistic and restrained, with enough clear floor and wall space to show the complete sofa and its true footprint. Avoid generic luxury staging, theme-park styling, excessive props, matching the room upholstery to the sofa, or changing the product to fit the environment.`,
  },
  studio: {
    name: "Студия",
    prompt: `A real professional daylight furniture studio with a warm light-gray seamless cyclorama, pale concrete floor, soft north-window key light and restrained studio fill. Keep the set empty except for the reference sofa. No props unless they are necessary for natural grounding.`,
  },
  light: {
    name: "Светлый интерьер",
    prompt: `A refined bright residential living room with warm-white paneled walls, pale oak floor, a tall sheer-curtained window and one restrained olive tree at the far edge. Editorial but lived-in, with broad uncluttered space around the sofa.`,
  },
  warm: {
    name: "Тёплый интерьер",
    prompt: `A warm contemporary living room with a limewashed taupe wall, walnut accents, a cream wool rug, one sculptural floor lamp and restrained abstract art. Late-afternoon daylight balanced with a practical lamp, without an orange color cast.`,
  },
  ugcApartmentWindow: {
    name: "UGC квартира",
    referenceImages: [
      "src/assets/background-presets/ugc-apartment-window-main-iphone-clean.jpg",
      "src/assets/background-presets/ugc-apartment-window-wide-iphone-clean.jpg",
    ],
    prompt: `A realistic casual smartphone photo inside the compact apartment shown in the internal room reference images. Preserve the room identity: warm off-white walls, pale natural oak floor, a large window with sheer white curtains and taupe side curtains, an ivory ribbed rectangular rug, a black arched floor lamp with a beige pleated shade, restrained three-panel abstract artwork on the right wall, an organic white ceiling pendant and soft daytime window light. Place the sofa naturally along the right wall under the artwork, grounded on the rug, with believable contact shadows and perspective. The result should feel like a real iPhone/UGC apartment photo: attainable, lightly imperfect, not a showroom, not a catalogue, not CGI.`,
    textOnlyPrompt: `A realistic casual smartphone photo in a compact apartment with warm off-white walls, pale natural oak floor, a large window with sheer white curtains and taupe side curtains, an ivory ribbed rectangular rug, a black arched floor lamp with a beige pleated shade, restrained three-panel abstract artwork on the right wall, an organic white ceiling pendant and soft daytime window light. Place the sofa naturally along the right wall under the artwork, grounded on the rug, with believable contact shadows and perspective. The result should feel like a real iPhone/UGC apartment photo: attainable, lightly imperfect, not a showroom, not a catalogue, not CGI.`,
    anglePrompts: {
      hero: `Main UGC sofa-ready hero angle from near the doorway/front-left side of the room, camera height around 125-135 cm, 26-28mm smartphone lens. Show the complete sofa along the right wall under the artwork, with the window and curtains visible on the left/back side and enough rug foreground for grounding. Slightly casual phone perspective, level enough but not studio-perfect. This is the main 3/4 selling angle, not the straight Front shot.`,
      front: `A straight-on casual smartphone view from near the center/front of the room, camera height around 125-140 cm, 28mm equivalent lens. The sofa front plane is mostly parallel to the camera along the right wall, with the window, curtains, lamp and rug still recognizable. Keep the photo useful and natural, like a real apartment listing or UGC shot; do not repeat the Hero 3/4 camera.`,
      depth: `Depth-profile UGC angle, not a pure side view and not the same as Hero: the camera orbits to roughly 50-65 degrees while the sofa footprint, rug contact, wall alignment and window direction stay fixed. Show more arm depth, seat depth and side profile without moving the sofa forward or reinventing hidden geometry.`,
      detail: `Casual close smartphone detail, not a full sofa view. Crop tightly on the sofa arm, seat edge, cushion junction, seams and fabric surface from inside the same apartment. Keep only enough background context to recognize the ivory rug, warm wall, curtains or lamp. Preserve exact upholstery, seams and construction while retaining phone-photo realism.`,
      elevated: `Slightly elevated UGC three-quarter angle, camera 20-30 degrees above normal phone height with visible top surfaces of the seat cushions and arms. Show the seat layout and cushion volume while preserving the same wall, rug, curtains, lamp and sofa footprint. Do not turn this into a top-down floor-plan view and do not repeat the Hero eye-level camera.`,
      room: `Wider casual smartphone room-context photograph, 26-28mm equivalent lens, showing the sofa smaller in frame and naturally placed in the recognizable compact apartment. Keep the window, taupe curtains, ivory rug, arched lamp, artwork, pale oak floor and ceiling light readable without making the room sterile or staged. This must be the widest shot in the set.`,
    },
  },
  ugcHerringboneLiving: {
    name: "UGC гостиная",
    referenceImages: [
      "src/assets/background-presets/ugc-herringbone-living-main-iphone-clean.jpg",
      "src/assets/background-presets/ugc-herringbone-living-wide-iphone-clean.jpg",
    ],
    prompt: `A realistic casual smartphone photo inside the quiet living room shown in the internal room reference images. Preserve the room identity: soft gray-beige limewashed plaster walls, white baseboards, warm pale-oak herringbone parquet, a large window at the left edge with sheer white curtain and taupe drapes, an ivory low-pile patterned rectangular rug in the foreground, a slim brass floor lamp with a simple cream cylindrical shade, two framed abstract geometric posters in warm wood frames, and soft diffused daytime window light. Place the sofa naturally along the main wall under the two posters, grounded on the front edge of the rug, leaving the lamp visible on the left and the corner/right wall alignment believable. The result should feel like a real iPhone/UGC apartment photo: attainable, lightly imperfect, mildly phone/JPEG textured, not a showroom, not a catalogue, not CGI.`,
    textOnlyPrompt: `A realistic casual smartphone photo in a quiet living room with soft gray-beige limewashed plaster walls, white baseboards, warm pale-oak herringbone parquet, a large window at the left edge with sheer white curtain and taupe drapes, an ivory low-pile patterned rectangular rug in the foreground, a slim brass floor lamp with a simple cream cylindrical shade, two framed abstract geometric posters in warm wood frames, and soft diffused daytime window light. Place the sofa naturally along the main wall under the two posters, grounded on the front edge of the rug, leaving the lamp visible on the left and the corner/right wall alignment believable. The result should feel like a real iPhone/UGC apartment photo: attainable, lightly imperfect, mildly phone/JPEG textured, not a showroom, not a catalogue, not CGI.`,
    anglePrompts: {
      hero: `Main UGC sofa-ready hero angle from slightly left of center, camera height around 125-135 cm, 26-28mm smartphone lens. Show the full sofa on the rug against the main plaster wall under the two framed posters, with the brass floor lamp and left curtains still readable. Keep the perspective relaxed and human, level enough for commerce but not studio-perfect. This is the main 3/4 selling angle, not the straight Front shot.`,
      front: `A straight-on casual smartphone view, camera height around 125-140 cm, 26-28mm smartphone lens. The sofa front plane is mostly parallel to the camera and stays aligned with the main wall beneath the posters; preserve the herringbone floor, rug edge, baseboard line and left-side lamp. Do not flatten the scene into a catalogue cutout and do not repeat the Hero 3/4 camera.`,
      depth: `Depth-profile UGC angle, not a pure side view and not the same as Hero: the camera orbits to roughly 50-65 degrees while the sofa footprint, rug contact, wall alignment, poster position, lamp position and window-light direction stay fixed. Reveal sofa depth and arm volume without sliding the sofa forward or reconstructing it from the room reference.`,
      detail: `Casual close smartphone detail, not a full sofa view. Crop tightly on the sofa arm, seat edge, cushion junction, seams and upholstery surface from inside the same room. Keep only enough background context to recognize the plaster wall, white baseboard, herringbone floor, ivory rug or framed artwork. Preserve exact upholstery, seams and construction while retaining mild phone-photo realism.`,
      elevated: `Slightly elevated UGC three-quarter angle, camera 20-30 degrees above normal phone height with visible top surfaces of the seat cushions and arms. Show seat layout and cushion volume while preserving the same wall, posters, floor lamp, rug contact and sofa footprint. Avoid a top-down floor-plan view, avoid repeating the Hero eye-level camera and avoid sterile architectural-render cleanliness.`,
      room: `Wider casual smartphone room-context photograph, 26-28mm equivalent lens, showing the sofa smaller in frame and naturally placed in the recognizable gray-beige living room. Keep the left window curtains, brass floor lamp, paired abstract posters, white baseboards, herringbone parquet and ivory patterned rug readable without making the room look staged. This must be the widest shot in the set.`,
    },
  },
});

export const CAMERA_RECIPES = Object.freeze({
  hero: {
    id: "hero",
    label: "Hero",
    prompt: `Front three-quarter hero view from slightly above seat height, showing the complete sofa and both its front and one side. 50mm full-frame lens, camera level, no wide-angle distortion. This must be visibly different from the straight Front, close Detail, Elevated and wide Room shots.`,
  },
  front: {
    id: "front",
    label: "Front",
    prompt: `Straight-on full frontal catalog view at seat height, perfectly level camera, full sofa visible with breathing room on every side. 55mm full-frame lens and natural perspective. The sofa front plane should be parallel to the camera; do not render this as another three-quarter hero view.`,
  },
  depth: {
    id: "depth",
    label: "Depth",
    prompt: `Depth-profile three-quarter view, not a pure 90-degree side view and not the same as Hero. The camera orbits around the sofa to roughly 50-65 degrees to show seat depth, arm profile, legs and side volume while the sofa remains in the same footprint. Camera level, natural perspective, no wide-angle distortion.`,
  },
  detail: {
    id: "detail",
    label: "Detail",
    prompt: `True close-up detail photograph, not a full sofa view. Crop tightly on the sofa arm, seat edge, cushion junction, seams, stitching and fabric surface so upholstery texture fills most of the frame. Preserve the exact fabric, stitching and construction. 85mm lens, shallow but believable depth of field; include only a small amount of room context.`,
  },
  elevated: {
    id: "elevated",
    label: "Elevated",
    prompt: `Slightly elevated front three-quarter product photograph, camera 20-30 degrees above normal eye level so the top surfaces of seats and arms are clearly visible. Show the seat plan, cushion layout, chaise or modular depth when present, and overall volume. Do not create a top-down floor-plan view and do not repeat the Hero eye-level angle.`,
  },
  room: {
    id: "room",
    label: "Room",
    prompt: `Wide room-context photograph with the complete sofa smaller in frame and naturally grounded in the selected interior. 35mm full-frame lens or realistic phone equivalent, enough surrounding room context for marketing use, visible floor/rug/walls/window or decor, no fisheye distortion. This must be the widest shot in the set.`,
  },
});

export const ANGLES = Object.freeze(Object.values(CAMERA_RECIPES));

export function getCamerasForShotSet(shotSetId) {
  return getShotSet(shotSetId).cameraIds.map((id) => CAMERA_RECIPES[id]);
}

const PRODUCT_LOCK = `
PRODUCT IDENTITY LOCK — the user-uploaded product images are the sole source of truth for the sofa.
Reproduce the exact same physical product, not a similar design.
Preserve without reinterpretation: overall silhouette; width-to-height-to-depth proportions; number and layout of modules; arm, back and seat geometry; cushion count and placement; seams, piping, tufting and stitch paths; leg count, shape, material and position; fabric color, weave, pile and material response; every visible construction detail.
Do not redesign, beautify, simplify, symmetrize, add, remove, resize or replace any part.
Do not add throws, decorative cushions, blankets, logos or accessories to the sofa.
INVENTORY LOCK — count every structural cushion and every loose/decorative cushion in the primary reference before rendering. Preserve those counts exactly. Never mirror a cushion to the opposite side, never invent a matching pair for symmetry, and never duplicate an item just because the camera moves. An item may become occluded from a new angle; it must not be replaced by an invented counterpart.
Use all product references together to understand the product. Image 1 is the primary identity reference. Other user-uploaded product images only clarify views and details. If product references conflict or a hidden detail is unknowable, choose the least inventive physically plausible continuation and keep it identical across the set.
`.trim();

const SECTION_GEOMETRY_LOCK = `
SECTION GEOMETRY LOCK — before rendering, audit the sofa horizontally in layers: lower/base modules, drawer fronts or pull tabs, seat panels, back cushions, arms and visible seams. Preserve mismatched layer counts exactly. Do not force the sofa into equal catalog thirds, equal cushion blocks, a cleaner symmetry, or a more standard modular layout.
If the references show unequal module widths, keep the original left-to-right width map. For a narrow-left / wide-center / narrow-right base, the center lower drawer or panel must remain visibly wider than each side panel; the main lower vertical seams should sit closer to one-quarter and three-quarters of the sofa width, not at one-third and two-thirds. For a 1:2:1 or similar base ratio, keep side modules about 25-30% each and the center module about 40-50%.
Back cushions and lower/base modules may have different counts. Do not collapse four back cushion channels into three large equal cushions, and do not align every back cushion to a lower drawer seam unless the product reference shows that exact alignment.
Drawer fronts, pull tabs, vertical seams, cushion breaks and arm edges are construction evidence, not decorative details. Preserve their spacing and use them to protect the original width map in every camera angle.
iPhone/UGC realism must not be achieved by narrowing, squeezing, regularizing or wide-angle-distorting the sofa. Keep the full product width, section ratios and footprint readable even in casual smartphone scenes.
`.trim();

const LEG_FOOTPRINT_LOCK = `
LEG AND FOOTPRINT LOCK — sofa legs are product identity, not decorative styling. Preserve the exact visible leg count, position, height, thickness, angle, material, color and shape from the user product references and approved preview frame. Never replace them with generic wooden, tapered, block, cylindrical, brass, black or matching-fabric legs unless that is exactly what the product reference shows.
If a rear leg, far-side leg or underside detail is hidden or unknowable from the references, keep it hidden, shadowed or minimally inferred. Do not make hidden legs more prominent to beautify the image, do not invent a symmetrical leg set and do not vary leg design between shots.
The sofa footprint is locked. Keep the same floor contact points, underside shadow, rug/floor alignment, wall distance, scale and seat height. Camera movement is allowed; sliding, rotating, lifting or redesigning the sofa is not.
`.trim();

const REALISM_LOCK = `
PHOTOGRAPHIC REALISM LOCK — this must look like a real commercial furniture photograph, never an AI render or architectural visualization.
Use physically plausible window and studio lighting, coherent shadow direction, grounded contact shadows, realistic fabric microtexture, subtle cushion compression, natural edge softness, restrained dynamic range, mild optical falloff and believable camera perspective.
Avoid CGI perfection, glossy plastic fabric, razor-sharp cutout edges, excessive HDR, oversmoothing, impossible reflections, floating furniture, warped walls, duplicate objects, surreal geometry, painterly texture, text, logos, borders and watermarks.
Show exactly one sofa. No people or animals.
`.trim();

const CAMERA_ORBIT_LOCK = `
CAMERA ORBIT LOCK — across a shot set, the camera may move but the sofa and room do not. Preserve the same sofa footprint, floor contact, rug alignment, wall position, window direction, lighting direction, sofa scale and seat height. Especially for Depth/Profile views, reveal depth by orbiting the camera, not by sliding the sofa forward or inventing a new side design.
`.trim();

const SHOT_DIFFERENTIATION_LOCK = `
SHOT DIFFERENTIATION LOCK — obey the requested camera recipe even when other references show a different view. Hero, Front, Depth, Detail, Elevated and Room must be visually distinct. Do not reuse the same crop, lens height, sofa scale or camera angle for multiple shots. Detail must be a close crop; Room must be the widest context shot; Elevated must clearly show top surfaces; Front must be straight-on; Depth must reveal side/profile volume.
`.trim();

const MATERIAL_CONTINUITY_LOCK = `
MATERIAL CONTINUITY LOCK — the sofa upholstery material must remain the same across the whole shot set: same fabric color, weave scale, pile direction, softness, seams, stitching and cushion compression. Room lighting may change local highlights, but the sofa must not become a different textile, cleaner catalogue fabric, smoother velvet, darker gray, or a newly reupholstered variant.
`.trim();

export function buildSofaPrompt({
  sceneId,
  angle,
  hasConsistencyAnchor = false,
  productReferenceCount = null,
  roomReferenceCount = 0,
  textOnlyBackground = false,
  revisionNote = "",
  outputFormat = null,
}) {
  const scene = SCENES[sceneId];
  if (!scene) throw new Error(`Unknown scene: ${sceneId}`);
  const roleInstruction =
    productReferenceCount && roomReferenceCount
      ? `INPUT ROLE MAP — Images 1-${productReferenceCount} are user-uploaded product references and are the only source of truth for the sofa. The next ${roomReferenceCount} internal image reference${roomReferenceCount === 1 ? "" : "s"} show only the room, lighting, phone-photo texture and composition for the selected background preset. Never copy or infer sofa design, cushions, legs, upholstery or proportions from internal room/background references.`
      : null;
  const anchorInstruction = hasConsistencyAnchor
    ? `SET CONSISTENCY — the final input image is a generated identity reference from this same photoshoot. Use it only for sofa inventory, proportions and material continuity. Do not copy its camera angle, crop, room layout, sofa placement or composition; the current CAMERA AND COMPOSITION instruction is higher priority. The user-uploaded reference images remain the highest authority. Do not copy any accidental drift from the generated reference.`
    : null;
  const anglePrompt = scene.anglePrompts?.[angle.id] ?? angle.prompt;
  const scenePrompt = textOnlyBackground ? scene.textOnlyPrompt ?? scene.prompt : scene.prompt;
  const isUgcScene = sceneId.startsWith("ugc");
  const backgroundInstruction = textOnlyBackground
    ? `TEXT-ONLY BACKGROUND — build the environment only from the written ENVIRONMENT instruction below. No room or background reference images are provided. The uploaded images define the sofa only.`
    : null;
  const revisionInstruction = revisionNote
    ? `OPERATOR CORRECTION — ${revisionNote}\nApply this correction to the new photograph, but never let it override PRODUCT IDENTITY, SECTION GEOMETRY, LEG AND FOOTPRINT, or MATERIAL CONTINUITY locks. Generate from the original user product references, not from a previous generated result.`
    : null;
  const formatInstruction = outputFormat
    ? `OUTPUT FORMAT — compose and render the final photograph in ${outputFormat.label} ${outputFormat.ratio} format. Keep the complete sofa comfortably inside the frame with intentional breathing room; do not crop its arms, legs, back, or footprint to fill the canvas.`
    : null;
  return [
    isUgcScene
      ? `Create one realistic iPhone/UGC apartment photograph of the sofa from the user-uploaded product reference images.`
      : `Create one high-end editorial product photograph of the sofa from the uploaded reference images.`,
    roleInstruction,
    PRODUCT_LOCK,
    SECTION_GEOMETRY_LOCK,
    LEG_FOOTPRINT_LOCK,
    CAMERA_ORBIT_LOCK,
    SHOT_DIFFERENTIATION_LOCK,
    MATERIAL_CONTINUITY_LOCK,
    anchorInstruction,
    backgroundInstruction,
    revisionInstruction,
    formatInstruction,
    `ENVIRONMENT — ${scene.name}: ${scenePrompt}`,
    `CAMERA AND COMPOSITION — ${angle.label}: ${anglePrompt}`,
    REALISM_LOCK,
    `Final check before rendering: compare the sofa against every user-uploaded product reference. If any visible product feature drifted, correct it to match the product references exactly. The environment may change; the sofa identity may not.`,
  ].filter(Boolean).join("\n\n");
}

export function buildPreviewFinalizePrompt({
  sceneId,
  angle,
  productReferenceCount = null,
  roomReferenceCount = 0,
}) {
  const scene = SCENES[sceneId];
  if (!scene) throw new Error(`Unknown scene: ${sceneId}`);
  const productCount = Number(productReferenceCount || 0);
  const previewImageNumber = productCount + roomReferenceCount + 1;
  const roleInstruction = productCount
    ? [
        `INPUT ROLE MAP — Images 1-${productCount} are user-uploaded product references and remain the highest authority for sofa identity, geometry, upholstery, seams, cushions and legs.`,
        roomReferenceCount
          ? `The next ${roomReferenceCount} internal room reference image${roomReferenceCount === 1 ? "" : "s"} show only the room, lighting, phone-photo texture and background geometry. Never copy sofa design, cushions, legs, upholstery or proportions from internal room/background references.`
          : null,
        `Image ${previewImageNumber} is the selected preview storyboard frame. Use it as the locked visual composition: camera, crop, sofa placement, room continuity, visible leg placement, contact shadows and overall arrangement must remain the same while improving fidelity for final download.`,
      ].filter(Boolean).join(" ")
    : null;
  const anglePrompt = scene.anglePrompts?.[angle.id] ?? angle.prompt;
  const isUgcScene = sceneId.startsWith("ugc");
  return [
    isUgcScene
      ? `Refine the selected preview storyboard frame into one realistic final iPhone/UGC apartment photograph.`
      : `Refine the selected preview storyboard frame into one high-end final product photograph.`,
    roleInstruction,
    `PREVIEW FRAME LOCK — preserve the selected preview frame's composition, camera angle, sofa footprint, crop, room layout, wall/rug/floor alignment, lighting direction, visible leg design and visible product construction. Improve sharpness, fabric readability, natural lens rendering and compression quality without reshooting, reposing, moving or redesigning the sofa. Do not make a new interpretation of the scene.`,
    PRODUCT_LOCK,
    SECTION_GEOMETRY_LOCK,
    LEG_FOOTPRINT_LOCK,
    MATERIAL_CONTINUITY_LOCK,
    `ENVIRONMENT — ${scene.name}: ${scene.prompt}`,
    `CAMERA AND COMPOSITION — ${angle.label}: ${anglePrompt}`,
    REALISM_LOCK,
    `Final check before rendering: the final image must still match both the selected preview frame and every user-uploaded product reference. If preview appearance conflicts with product references for legs, seams, cushion inventory or geometry, keep the preview composition but correct the product detail to the user references.`,
  ].filter(Boolean).join("\n\n");
}

export function buildContactSheetPrompt({
  sceneId,
  shotSetId,
  productReferenceCount = null,
  roomReferenceCount = 0,
}) {
  const scene = SCENES[sceneId];
  if (!scene) throw new Error(`Unknown scene: ${sceneId}`);
  const shotSet = getShotSet(shotSetId);
  const cameras = getCamerasForShotSet(shotSet.id);
  const roleInstruction =
    productReferenceCount && roomReferenceCount
      ? `INPUT ROLE MAP — Images 1-${productReferenceCount} are user-uploaded product references and are the only source of truth for the sofa. The next ${roomReferenceCount} internal image reference${roomReferenceCount === 1 ? "" : "s"} show only the room, lighting, phone-photo texture and composition for the selected background preset. Never copy or infer sofa design, cushions, legs, upholstery or proportions from internal room/background references.`
      : null;
  const cells = cameras
    .map((camera, index) => {
      const anglePrompt = scene.anglePrompts?.[camera.id] ?? camera.prompt;
      return `${index + 1}. ${camera.label}: ${anglePrompt}`;
    })
    .join("\n");

  return [
    `Create one preview contact sheet collage for a Sofa.ai ${shotSet.count}-shot product photoshoot. This is a low-cost storyboard preview, not the final customer export.`,
    roleInstruction,
    PRODUCT_LOCK,
    SECTION_GEOMETRY_LOCK,
    LEG_FOOTPRINT_LOCK,
    CAMERA_ORBIT_LOCK,
    `ENVIRONMENT — ${scene.name}: ${scene.prompt}`,
    `GRID — exact ${shotSet.grid.columns} columns by ${shotSet.grid.rows} rows. Each cell must be one clean photograph with no text, no labels, no numbers, no UI, no borders inside the photo and no watermark. Use thin even gutters only so the known grid can be cropped without AI.`,
    `CAMERA CELLS — preserve the same sofa identity and room continuity across all cells:\n${cells}`,
    REALISM_LOCK,
    `Final check before rendering: all cells must show the same physical sofa in the same room. Camera changes are allowed; sofa movement, different rooms, different upholstery, invented cushions and pure side-view reconstruction are not allowed.`,
  ].filter(Boolean).join("\n\n");
}
