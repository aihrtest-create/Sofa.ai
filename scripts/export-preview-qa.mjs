#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createQaExport } from "../server/qa-export.js";
import {
  SCENES,
  buildContactSheetPrompt,
  buildPreviewFinalizePrompt,
  getCamerasForShotSet,
} from "../server/prompts.js";
import { getShotSet } from "../shared/shotSets.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const sceneId = args.scene || "ugcHerringboneLiving";
const shotSetId = args["shot-set"] || "quick";
const source = args.source || "codex-simulation";
const productCount = Number(args["product-count"] || 1);
const scene = SCENES[sceneId];
const shotSet = getShotSet(shotSetId);

if (!scene) throw new Error(`Unknown scene: ${sceneId}`);

const roomReferenceCount = scene.referenceImages?.length ?? 0;
const prompts = {
  "contact-sheet": buildContactSheetPrompt({
    sceneId,
    shotSetId: shotSet.id,
    productReferenceCount: productCount,
    roomReferenceCount,
  }),
};

for (const camera of getCamerasForShotSet(shotSet.id)) {
  prompts[`finalize-${String(shotSet.cameraIds.indexOf(camera.id) + 1).padStart(2, "0")}-${camera.id}`] =
    buildPreviewFinalizePrompt({
      sceneId,
      angle: camera,
      productReferenceCount: productCount,
      roomReferenceCount,
    });
}

const artifacts = getAll(args.artifact).map((filePath, index) => ({
  filePath,
  role: "codex-simulation",
  label: `Simulation artifact ${index + 1}`,
  name: `simulation-${String(index + 1).padStart(2, "0")}`,
}));

const result = await createQaExport({
  root,
  source,
  sceneId,
  shotSetId: shotSet.id,
  notes: args.note || "Prompt-only QA export. No product API call was made.",
  prompts,
  artifacts,
});

console.log(JSON.stringify(result, null, 2));

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const [rawKey, inlineValue] = item.slice(2).split("=", 2);
    const value = inlineValue ?? (argv[index + 1]?.startsWith("--") ? true : argv[++index]);
    if (parsed[rawKey]) {
      parsed[rawKey] = Array.isArray(parsed[rawKey])
        ? [...parsed[rawKey], value]
        : [parsed[rawKey], value];
    } else {
      parsed[rawKey] = value;
    }
  }
  return parsed;
}

function getAll(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}
