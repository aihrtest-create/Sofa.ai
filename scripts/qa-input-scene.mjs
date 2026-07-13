#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SCENES, buildContactSheetPrompt, getCamerasForShotSet } from "../server/prompts.js";
import { getShotSet } from "../shared/shotSets.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IMAGE_RE = /\.(jpe?g|png|webp)$/i;

const args = parseArgs(process.argv.slice(2));
const sceneId = String(args.scene || "ugcHerringboneLiving");
const inputDir = path.resolve(root, String(args.input || "qa/input-sofas"));
const shotSet = getShotSet("full");
const scene = SCENES[sceneId];

if (!scene) throw new Error(`Unknown scene: ${sceneId}`);

const sofas = await readInputSofas(inputDir);
if (!sofas.length) throw new Error(`No sofa folders with images found in ${inputDir}`);

const batchId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${sceneId}-input-sofas`;
const batchFolder = path.join(root, "qa", "generation", batchId);
const promptsFolder = path.join(batchFolder, "prompts");
await fs.mkdir(promptsFolder, { recursive: true });

const runs = [];
for (const sofa of sofas) {
  const runId = `${sofa.id}-${sceneId}`;
  const runFolder = path.join(batchFolder, "runs", runId);
  const refsFolder = path.join(runFolder, "refs");
  const imagesFolder = path.join(runFolder, "images");
  await fs.mkdir(refsFolder, { recursive: true });
  await fs.mkdir(imagesFolder, { recursive: true });

  const copiedRefs = [];
  for (const [index, imagePath] of sofa.images.entries()) {
    const ext = path.extname(imagePath).toLowerCase() || ".jpg";
    const filename = `${String(index + 1).padStart(2, "0")}${ext === ".jpeg" ? ".jpg" : ext}`;
    await fs.copyFile(imagePath, path.join(refsFolder, filename));
    copiedRefs.push(path.join("refs", filename));
  }

  const prompt = buildRealSofaPrompt({
    sceneId,
    productReferenceCount: copiedRefs.length,
    roomReferenceCount: scene.referenceImages?.length ?? 0,
  });
  await fs.writeFile(path.join(promptsFolder, `${runId}.txt`), prompt, "utf8");
  await fs.writeFile(path.join(runFolder, "reference-sheet.svg"), renderReferenceSheet({ sofa, refs: copiedRefs }), "utf8");

  const scoring = getCamerasForShotSet(shotSet.id).map((camera, index) => ({
    collage: runId,
    scene: sceneId,
    sofa: sofa.id,
    frame: `${String(index + 1).padStart(2, "0")}-${camera.id}`,
    severity: "UNSCORED",
    category: "",
    issue: "",
    likelyFixArea: "",
    artifact: path.join("images", `${String(index + 1).padStart(2, "0")}-${camera.id}.jpg`),
  }));

  const manifest = {
    id: runId,
    source: "input-sofa-codex-simulation",
    sceneId,
    sceneName: scene.name,
    sofa: {
      id: sofa.id,
      sourceFolder: path.relative(root, sofa.folder),
      referenceCount: copiedRefs.length,
      references: copiedRefs,
    },
    shotSet: {
      id: shotSet.id,
      name: shotSet.name,
      summary: shotSet.summary,
      count: shotSet.count,
      grid: shotSet.grid,
    },
    prompt: path.join("..", "..", "prompts", `${runId}.txt`),
    expectedGeneratedArtifacts: [
      path.join("images", "contact-sheet.jpg"),
      ...scoring.map((row) => row.artifact),
    ],
    scoring,
  };

  await fs.writeFile(path.join(runFolder, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(runFolder, "REVIEW.md"), buildRunReview(manifest), "utf8");
  runs.push(manifest);
}

const batchManifest = {
  id: batchId,
  source: "input-sofa-codex-simulation",
  createdAt: new Date().toISOString(),
  sceneId,
  sceneName: scene.name,
  inputDir: path.relative(root, inputDir),
  shotSet: {
    id: shotSet.id,
    name: shotSet.name,
    summary: shotSet.summary,
    count: shotSet.count,
    grid: shotSet.grid,
  },
  sofaCount: runs.length,
  expectedContactSheets: runs.length,
  expectedFrames: runs.length * shotSet.count,
  runs: runs.map((run) => ({
    id: run.id,
    sofa: run.sofa.id,
    referenceCount: run.sofa.referenceCount,
    prompt: path.join("prompts", `${run.id}.txt`),
    review: path.join("runs", run.id, "REVIEW.md"),
    referenceSheet: path.join("runs", run.id, "reference-sheet.svg"),
  })),
};

await fs.writeFile(path.join(batchFolder, "manifest.json"), `${JSON.stringify(batchManifest, null, 2)}\n`, "utf8");
await fs.writeFile(path.join(batchFolder, "SUMMARY.md"), buildSummary(batchManifest, runs), "utf8");
await fs.writeFile(path.join(batchFolder, "issues-template.tsv"), buildIssuesTemplate(runs), "utf8");

console.log(JSON.stringify({
  id: batchId,
  folder: batchFolder,
  summaryPath: path.join(batchFolder, "SUMMARY.md"),
  sofaCount: runs.length,
  expectedContactSheets: batchManifest.expectedContactSheets,
  expectedFrames: batchManifest.expectedFrames,
}, null, 2));

async function readInputSofas(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const folders = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const sofas = [];
  for (const folderName of folders) {
    const folder = path.join(directory, folderName);
    const files = (await fs.readdir(folder, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && IMAGE_RE.test(entry.name))
      .map((entry) => path.join(folder, entry.name))
      .sort((a, b) => path.basename(a).localeCompare(path.basename(b), undefined, { numeric: true }));
    if (files.length) sofas.push({ id: folderName, folder, images: files });
  }
  return sofas;
}

function buildRealSofaPrompt({ sceneId, productReferenceCount, roomReferenceCount }) {
  const prompt = buildContactSheetPrompt({
    sceneId,
    shotSetId: "full",
    productReferenceCount,
    roomReferenceCount,
  });
  return [
    "SOFA.AI REAL INPUT QA — use every uploaded sofa image from this sofa folder together as product references.",
    `There are ${productReferenceCount} product reference images for one physical sofa. Do not choose only one; combine all of them to preserve silhouette, depth, cushions, seams, upholstery, legs and hidden geometry.`,
    "If references include screenshots, catalog crops or phone photos, still treat them as product identity evidence. The room/background may change; the sofa identity may not.",
    prompt,
  ].join("\n\n");
}

function renderReferenceSheet({ sofa, refs }) {
  const width = 1400;
  const cellWidth = 420;
  const cellHeight = 320;
  const columns = 3;
  const rows = Math.ceil(refs.length / columns);
  const height = 150 + rows * cellHeight;
  const cells = refs.map((ref, index) => {
    const x = 40 + (index % columns) * (cellWidth + 25);
    const y = 120 + Math.floor(index / columns) * cellHeight;
    return `<g transform="translate(${x} ${y})">
  <rect width="${cellWidth}" height="${cellHeight - 34}" rx="0" fill="#f8f4ed" stroke="#b8ad9f"/>
  <image href="${escapeXml(ref)}" x="10" y="10" width="${cellWidth - 20}" height="${cellHeight - 54}" preserveAspectRatio="xMidYMid meet"/>
  <text x="0" y="${cellHeight - 8}" font-family="Arial, sans-serif" font-size="18" fill="#554b43">${String(index + 1).padStart(2, "0")} · ${escapeXml(path.basename(ref))}</text>
</g>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="100%" height="100%" fill="#fbf7ef"/>
<text x="40" y="58" font-family="Arial, sans-serif" font-size="36" fill="#4b211f">Sofa ${escapeXml(sofa.id)} references</text>
<text x="40" y="92" font-family="Arial, sans-serif" font-size="20" fill="#6f655d">All images in this sheet belong to one sofa and should be used together.</text>
${cells}
</svg>
`;
}

function buildRunReview(manifest) {
  const rows = manifest.scoring.map((row) => {
    return `| ${row.frame} | UNSCORED |  |  |  | \`${row.artifact}\` |`;
  }).join("\n");
  return `# QA Review ${manifest.id}

- Scene: \`${manifest.sceneName}\` (${manifest.sceneId})
- Sofa input folder: \`${manifest.sofa.sourceFolder}\`
- Product references: ${manifest.sofa.referenceCount}
- Prompt: \`${manifest.prompt}\`

## Reference Rule

Use all product references from this sofa folder together. Do not evaluate or generate from only one image.

## Frame Scoring

| Frame | Severity | Issue | Category | Likely fix area | Artifact |
| --- | --- | --- | --- | --- | --- |
${rows}
`;
}

function buildSummary(batch, runs) {
  const rows = runs.flatMap((run) => run.scoring.map((row) => {
    return `| ${row.collage} | ${row.scene} | ${row.sofa} | ${row.frame} | UNSCORED |  |  | |`;
  })).join("\n");
  const runRows = batch.runs.map((run) => {
    return `| ${run.id} | ${run.referenceCount} | \`${run.prompt}\` | \`${run.referenceSheet}\` |`;
  }).join("\n");
  return `# Sofa.ai Input Sofa QA ${batch.id}

This batch is prepared for real user-like sofa inputs from \`${batch.inputDir}\` using one background: \`${batch.sceneName}\`.

## Batch

- Sofas: ${batch.sofaCount}
- Expected contact sheets: ${batch.expectedContactSheets}
- Expected cropped frames: ${batch.expectedFrames}
- Shot set: \`${batch.shotSet.name}\` (${batch.shotSet.summary})
- Grid: ${batch.shotSet.grid.columns}x${batch.shotSet.grid.rows}

## Runs

| run | product refs | prompt | reference sheet |
| --- | ---: | --- | --- |
${runRows}

## Problems Table

| collage | scene | sofa | frame | severity | issue | likely_fix_area | notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
${rows}

## Acceptance Focus

- All refs in one sofa folder are one product and must be used together.
- Check leg count, leg placement, footprint, seat height and scale first.
- Then check shot intent: Front, Depth, Detail, Elevated and Room must differ.
- Then check material continuity and room continuity.
`;
}

function buildIssuesTemplate(runs) {
  const header = "collage\tscene\tsofa\tframe\tseverity\tcategory\tissue\tlikely_fix_area\tnotes\n";
  const rows = runs.flatMap((run) => run.scoring.map((row) => {
    return [row.collage, row.scene, row.sofa, row.frame, "", "", "", "", ""].join("\t");
  }));
  return `${header}${rows.join("\n")}\n`;
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const [rawKey, inlineValue] = item.slice(2).split("=", 2);
    parsed[rawKey] = inlineValue ?? (argv[index + 1]?.startsWith("--") ? true : argv[++index]);
  }
  return parsed;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
