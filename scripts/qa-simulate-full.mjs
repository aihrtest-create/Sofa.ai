#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SCENES, buildContactSheetPrompt, getCamerasForShotSet } from "../server/prompts.js";
import { getShotSet } from "../shared/shotSets.js";

export const QA_SIMULATION_SCENES = Object.freeze(["ugcHerringboneLiving", "ugcApartmentWindow"]);

export const QA_SOFA_ARCHETYPES = Object.freeze([
  {
    id: "straight-visible-legs",
    name: "Прямой диван с видимыми ножками",
    focus: "leg fidelity, seat height, scale and footprint",
    prompt:
      "A straight three-seat sofa with slim visible dark metal legs, low arms, three separate seat cushions, three back cushions, straight front apron, warm gray textured woven upholstery and clearly visible floor contact points.",
  },
  {
    id: "chaise-asymmetric",
    name: "Угловой / chaise / асимметричный диван",
    focus: "chaise placement, asymmetric footprint, cushion inventory and hidden geometry",
    prompt:
      "An asymmetric L-shaped sofa with a right-hand chaise extension, blocky low arms, two standard seat cushions plus one long chaise cushion, short recessed black legs, soft beige bouclé upholstery and a footprint that must not become mirrored or centered.",
  },
  {
    id: "rounded-modular-seams",
    name: "Мягкий модульный диван с выраженными швами",
    focus: "rounded module drift, seam paths, cushion count and material continuity",
    prompt:
      "A rounded modular lounge sofa with plump curved modules, thick pillow-like arms, visible vertical seam channels, low hidden glides, muted mushroom chenille upholstery and soft compressed cushion edges that must remain consistent across every camera.",
  },
]);

export const QA_SEVERITIES = Object.freeze(["P0 blocker", "P1 major", "P2 minor", "Pass"]);

export const QA_ISSUE_CATEGORIES = Object.freeze([
  "Sofa identity",
  "Legs/footprint",
  "Scale",
  "Shot intent",
  "Room continuity",
  "Material continuity",
  "Realism",
]);

export const QA_FIX_AREAS = Object.freeze([
  "prompt locks",
  "camera recipe",
  "room scene prompt",
  "grid/crop",
  "archetype handling",
]);

const DEFAULT_CREATED_AT = () => new Date();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function createSimulationBatch({
  rootDir = root,
  createdAt = DEFAULT_CREATED_AT(),
  collageInputs = new Map(),
  issueRows = [],
  promptCards = true,
} = {}) {
  const shotSet = getShotSet("full");
  const runs = buildRunMatrix();
  const id = `${qaRunId(createdAt)}-simulation-batch`;
  const folder = path.join(rootDir, "qa", "generation", id);
  const promptDir = path.join(folder, "prompts");
  await fs.mkdir(promptDir, { recursive: true });

  const runResults = [];
  for (const run of runs) {
    const runFolder = path.join(folder, "runs", run.id);
    const imagesDir = path.join(runFolder, "images");
    await fs.mkdir(imagesDir, { recursive: true });

    const prompt = buildSimulationContactSheetPrompt(run);
    const promptPath = path.join(promptDir, `${run.id}.txt`);
    await fs.writeFile(promptPath, prompt, "utf8");

    const collageInput = collageInputs.get(run.key) ?? collageInputs.get(run.id) ?? null;
    const artifacts = collageInput
      ? await writeRasterArtifacts({ run, shotSet, collageInput, imagesDir })
      : await writePromptCardArtifacts({ run, shotSet, prompt, imagesDir, promptCards });

    const runManifest = {
      id: run.id,
      source: "codex-simulation",
      sceneId: run.sceneId,
      sceneName: SCENES[run.sceneId].name,
      sofaArchetype: {
        id: run.archetype.id,
        name: run.archetype.name,
        focus: run.archetype.focus,
      },
      shotSet: {
        id: shotSet.id,
        name: shotSet.name,
        summary: shotSet.summary,
        count: shotSet.count,
        grid: shotSet.grid,
      },
      prompt: path.relative(runFolder, promptPath),
      artifacts,
      scoring: buildScoringRows(run, shotSet, artifacts, issueRows),
      notes:
        "Codex/chat image generation simulation QA only. This folder does not prove runtime Image API behavior or spend product API limits.",
    };

    await fs.writeFile(path.join(runFolder, "manifest.json"), `${JSON.stringify(runManifest, null, 2)}\n`, "utf8");
    await fs.writeFile(path.join(runFolder, "REVIEW.md"), buildRunReviewMarkdown(runManifest), "utf8");
    runResults.push(runManifest);
  }

  const batchManifest = {
    id,
    source: "codex-simulation",
    createdAt: createdAt.toISOString(),
    shotSet: {
      id: shotSet.id,
      name: shotSet.name,
      summary: shotSet.summary,
      count: shotSet.count,
      grid: shotSet.grid,
    },
    matrix: {
      scenes: QA_SIMULATION_SCENES,
      sofaArchetypes: QA_SOFA_ARCHETYPES.map(({ id, name, focus }) => ({ id, name, focus })),
      contactSheets: runResults.length,
      frames: runResults.reduce((sum, run) => sum + run.scoring.length, 0),
    },
    objectivityRules: [
      "Use the same prompt builder for every run.",
      "Keep scenes and the full 6-shot set fixed.",
      "Score frames before proposing fixes.",
      "Count repeated issues by category, camera, scene and archetype.",
      "Treat Codex/chat simulation as prompt QA, not production API proof.",
    ],
    rubric: {
      severities: QA_SEVERITIES,
      categories: QA_ISSUE_CATEGORIES,
      likelyFixAreas: QA_FIX_AREAS,
    },
    runs: runResults.map((run) => ({
      id: run.id,
      sceneId: run.sceneId,
      sofaArchetypeId: run.sofaArchetype.id,
      review: path.join("runs", run.id, "REVIEW.md"),
      manifest: path.join("runs", run.id, "manifest.json"),
    })),
  };

  await fs.writeFile(path.join(folder, "manifest.json"), `${JSON.stringify(batchManifest, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(folder, "SUMMARY.md"), buildSummaryMarkdown(batchManifest, runResults), "utf8");
  await fs.writeFile(path.join(folder, "issues-template.tsv"), buildIssuesTemplate(runResults), "utf8");

  return {
    id,
    folder,
    manifestPath: path.join(folder, "manifest.json"),
    summaryPath: path.join(folder, "SUMMARY.md"),
    contactSheetCount: runResults.length,
    frameCount: batchManifest.matrix.frames,
  };
}

export function buildRunMatrix() {
  const runs = [];
  let index = 1;
  for (const sceneId of QA_SIMULATION_SCENES) {
    if (!SCENES[sceneId]) throw new Error(`Unknown QA simulation scene: ${sceneId}`);
    for (const archetype of QA_SOFA_ARCHETYPES) {
      const id = `${String(index).padStart(2, "0")}-${sceneId}-${archetype.id}`;
      runs.push({
        index,
        id,
        key: `${sceneId}:${archetype.id}`,
        sceneId,
        archetype,
      });
      index += 1;
    }
  }
  return runs;
}

export function buildSimulationContactSheetPrompt(run) {
  const roomReferenceCount = SCENES[run.sceneId].referenceImages?.length ?? 0;
  const basePrompt = buildContactSheetPrompt({
    sceneId: run.sceneId,
    shotSetId: "full",
    productReferenceCount: 1,
    roomReferenceCount,
  });
  return [
    "SOFA.AI QA SIMULATION BRIEF — generate one full contact-sheet collage for internal prompt QA. Do not call or imply the product runtime API.",
    `CONTROLLED PRODUCT REFERENCE — For this simulation, treat the following sofa as Image 1, the sole product source of truth: ${run.archetype.prompt}`,
    `ARCHETYPE QA FOCUS — ${run.archetype.focus}. Deliberately preserve this product across every cell so drift is easy to inspect.`,
    basePrompt,
    "QA OUTPUT REQUIREMENT — return exactly one 3x2 contact sheet with six clean photographic cells and no labels, numbers, watermarks, UI chrome or decorative borders inside the cells.",
  ].join("\n\n");
}

async function writePromptCardArtifacts({ run, shotSet, prompt, imagesDir, promptCards }) {
  if (!promptCards) {
    throw new Error(`Missing collage input for ${run.key}. Pass --prompt-cards to create local prompt-card artifacts.`);
  }
  const cameras = getCamerasForShotSet(shotSet.id);
  const contactSheet = "contact-sheet.svg";
  await fs.writeFile(
    path.join(imagesDir, contactSheet),
    renderContactSheetSvg({ run, shotSet, prompt }),
    "utf8",
  );
  const artifacts = [
    {
      role: "contact-sheet",
      label: "Prompt card contact sheet placeholder",
      path: path.join("images", contactSheet),
      generated: false,
    },
  ];
  for (const [index, camera] of cameras.entries()) {
    const filename = `${String(index + 1).padStart(2, "0")}-${camera.id}.svg`;
    await fs.writeFile(path.join(imagesDir, filename), renderTileSvg({ run, camera, index }), "utf8");
    artifacts.push({
      role: "preview-tile",
      label: `${camera.label} prompt card`,
      cameraId: camera.id,
      path: path.join("images", filename),
      generated: false,
    });
  }
  return artifacts;
}

async function writeRasterArtifacts({ run, shotSet, collageInput, imagesDir }) {
  const sourcePath = path.resolve(collageInput);
  await fs.access(sourcePath);
  const extension = normalizeImageExtension(path.extname(sourcePath));
  const contactSheet = `contact-sheet${extension}`;
  await fs.copyFile(sourcePath, path.join(imagesDir, contactSheet));

  const dimensions = readImageDimensions(sourcePath);
  const cameras = getCamerasForShotSet(shotSet.id);
  const cellWidth = Math.floor(dimensions.width / shotSet.grid.columns);
  const cellHeight = Math.floor(dimensions.height / shotSet.grid.rows);
  if (cellWidth <= 0 || cellHeight <= 0) {
    throw new Error(`Invalid collage dimensions for ${run.key}: ${dimensions.width}x${dimensions.height}`);
  }

  const artifacts = [
    {
      role: "contact-sheet",
      label: "Generated contact sheet",
      path: path.join("images", contactSheet),
      generated: true,
      width: dimensions.width,
      height: dimensions.height,
    },
  ];

  for (const [index, camera] of cameras.entries()) {
    const column = index % shotSet.grid.columns;
    const row = Math.floor(index / shotSet.grid.columns);
    const filename = `${String(index + 1).padStart(2, "0")}-${camera.id}${extension}`;
    const outputPath = path.join(imagesDir, filename);
    cropImageWithSips({
      inputPath: sourcePath,
      outputPath,
      width: cellWidth,
      height: cellHeight,
      x: column * cellWidth,
      y: row * cellHeight,
    });
    artifacts.push({
      role: "preview-tile",
      label: `${camera.label} cropped tile`,
      cameraId: camera.id,
      path: path.join("images", filename),
      generated: true,
      crop: { x: column * cellWidth, y: row * cellHeight, width: cellWidth, height: cellHeight },
    });
  }
  return artifacts;
}

function readImageDimensions(filePath) {
  const result = spawnSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", filePath], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`Unable to read image dimensions with sips: ${result.stderr || result.stdout}`);
  }
  const width = Number(/pixelWidth:\s*(\d+)/.exec(result.stdout)?.[1]);
  const height = Number(/pixelHeight:\s*(\d+)/.exec(result.stdout)?.[1]);
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error(`Unable to parse image dimensions for ${filePath}`);
  }
  return { width, height };
}

function cropImageWithSips({ inputPath, outputPath, width, height, x, y }) {
  const result = spawnSync(
    "sips",
    ["-c", String(height), String(width), "--cropOffset", String(y), String(x), inputPath, "--out", outputPath],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`Unable to crop ${inputPath}: ${result.stderr || result.stdout}`);
  }
}

function buildScoringRows(run, shotSet, artifacts, issueRows = []) {
  const tileArtifacts = artifacts.filter((artifact) => artifact.role === "preview-tile");
  return getCamerasForShotSet(shotSet.id).map((camera, index) => {
    const artifact = tileArtifacts.find((item) => item.cameraId === camera.id);
    const frame = `${String(index + 1).padStart(2, "0")}-${camera.id}`;
    const issue = issueRows.find((row) => {
      return row.collage === run.id && row.frame === frame;
    });
    return {
      collage: run.id,
      scene: run.sceneId,
      archetype: run.archetype.id,
      frame,
      severity: issue?.severity || "UNSCORED",
      issue: issue?.issue || "",
      category: issue?.category || "",
      likelyFixArea: issue?.likelyFixArea || issue?.likely_fix_area || "",
      notes: issue?.notes || "",
      artifact: artifact?.path ?? "",
    };
  });
}

function buildRunReviewMarkdown(manifest) {
  const frameRows = manifest.scoring.map((row) => {
    return `| ${row.frame} | ${row.severity} | ${escapeMarkdownCell(row.issue)} | ${row.category} | ${row.likelyFixArea} | \`${row.artifact}\` |`;
  }).join("\n");
  const rubric = [
    "| Severity | Meaning |",
    "| --- | --- |",
    "| P0 blocker | Нельзя использовать: другой диван, сломанная геометрия, неверные ноги, диван плавает. |",
    "| P1 major | Заметный drift: неправильный размер, chaise/подушки/ножки, повтор Hero вместо нужного кадра. |",
    "| P2 minor | Мелкая проблема реализма, crop, света, phone texture или room continuity. |",
    "| Pass | Кадр годится как preview-кандидат. |",
  ].join("\n");

  return `# QA Review ${manifest.id}

- Source: \`${manifest.source}\`
- Scene: \`${manifest.sceneId}\` (${manifest.sceneName})
- Archetype: \`${manifest.sofaArchetype.id}\` — ${manifest.sofaArchetype.name}
- Shot set: \`${manifest.shotSet.name}\` (${manifest.shotSet.summary})
- Prompt: \`${manifest.prompt}\`

## Rubric

${rubric}

## Frame Scoring

| Frame | Severity | Issue | Category | Likely fix area | Artifact |
| --- | --- | --- | --- | --- | --- |
${frameRows}

## Categories

${QA_ISSUE_CATEGORIES.map((category) => `- ${category}`).join("\n")}

## Fix Areas

${QA_FIX_AREAS.map((area) => `- ${area}`).join("\n")}
`;
}

function buildSummaryMarkdown(batchManifest, runResults) {
  const rows = runResults.flatMap((run) => run.scoring).map((row) => {
    return `| ${row.collage} | ${row.scene} | ${row.archetype} | ${row.frame} | ${row.severity} | ${escapeMarkdownCell(row.issue)} | ${row.likelyFixArea} | ${escapeMarkdownCell(row.notes)} |`;
  }).join("\n");
  const topIssueRows = buildTopIssueRows(runResults);
  const categoryRows = buildCategoryRows(runResults, batchManifest.matrix.frames);
  return `# Sofa.ai Simulation QA Batch ${batchManifest.id}

This is a no-product-API QA package for six Codex/chat simulation contact sheets. It is designed to expose prompt and composition risks before a minimal real API smoke test.

## Matrix

- Contact sheets: ${batchManifest.matrix.contactSheets}
- Cropped frames: ${batchManifest.matrix.frames}
- Shot set: \`${batchManifest.shotSet.name}\` (${batchManifest.shotSet.summary})
- Grid: ${batchManifest.shotSet.grid.columns}x${batchManifest.shotSet.grid.rows}
- Scenes: ${batchManifest.matrix.scenes.join(", ")}
- Sofa archetypes: ${batchManifest.matrix.sofaArchetypes.map((item) => item.id).join(", ")}

## Problems Table

Fill this table after visual review of the generated/cropped frames.

| collage | scene | archetype | frame | severity | issue | likely_fix_area | notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
${rows}

## Top 5 Recurring Problems

| rank | category | issue | count | likely_fix_area | severity mix |
| ---: | --- | --- | ---: | --- | --- |
${topIssueRows}

## Category Counts

| category | count | current read |
| --- | ---: | --- |
${categoryRows}

## First Fix Decision Rules

- If the same problem appears across scenes and archetypes, fix prompt locks first.
- If a problem clusters by camera, fix that camera recipe first.
- If a problem clusters by one room, fix the room scene prompt first.
- If crops are wrong but the collage is correct, fix grid/crop handling.
- If only one archetype fails, fix archetype handling and reference wording.

## Production Caveat

Codex/chat simulation does not prove runtime Image API request behavior, moderation behavior, cost accounting, streaming or timeout handling. Keep one minimal real API smoke test before trusting production behavior.
`;
}

function buildIssuesTemplate(runResults) {
  const header = "collage\tscene\tarchetype\tframe\tseverity\tcategory\tissue\tlikely_fix_area\tnotes\n";
  const rows = runResults.flatMap((run) => run.scoring).map((row) => {
    return [row.collage, row.scene, row.archetype, row.frame, "", "", "", "", ""].join("\t");
  });
  return `${header}${rows.join("\n")}\n`;
}

function buildTopIssueRows(runResults) {
  const scored = runResults
    .flatMap((run) => run.scoring)
    .filter((row) => row.issue && row.severity !== "Pass" && row.severity !== "UNSCORED");
  if (!scored.length) {
    return "| 1 |  |  | 0 |  | Score generated frames first |";
  }
  const groups = new Map();
  for (const row of scored) {
    const key = [row.category || "Uncategorized", row.issue, row.likelyFixArea || ""].join("\u0000");
    const current = groups.get(key) ?? {
      category: row.category || "Uncategorized",
      issue: row.issue,
      likelyFixArea: row.likelyFixArea || "",
      count: 0,
      severities: new Map(),
    };
    current.count += 1;
    current.severities.set(row.severity, (current.severities.get(row.severity) ?? 0) + 1);
    groups.set(key, current);
  }
  return [...groups.values()]
    .sort((a, b) => b.count - a.count || severityRank(b) - severityRank(a))
    .slice(0, 5)
    .map((group, index) => {
      const severityMix = [...group.severities.entries()].map(([severity, count]) => `${severity}: ${count}`).join(", ");
      return `| ${index + 1} | ${group.category} | ${escapeMarkdownCell(group.issue)} | ${group.count} | ${group.likelyFixArea} | ${severityMix} |`;
    })
    .join("\n");
}

function buildCategoryRows(runResults, totalFrames) {
  const scored = runResults.flatMap((run) => run.scoring);
  return QA_ISSUE_CATEGORIES.map((category) => {
    const count = scored.filter((row) => row.category === category && row.severity !== "Pass" && row.severity !== "UNSCORED").length;
    const currentRead = count ? "Review repeated failures before prompt edits" : "Score generated frames first";
    return `| ${category} | ${count} / ${totalFrames} | ${currentRead} |`;
  }).join("\n");
}

function severityRank(group) {
  const ranks = { "P0 blocker": 3, "P1 major": 2, "P2 minor": 1 };
  let score = 0;
  for (const [severity, count] of group.severities.entries()) {
    score += (ranks[severity] ?? 0) * count;
  }
  return score;
}

function renderContactSheetSvg({ run, shotSet, prompt }) {
  const width = 1800;
  const height = 1200;
  const cellWidth = width / shotSet.grid.columns;
  const cellHeight = height / shotSet.grid.rows;
  const cameras = getCamerasForShotSet(shotSet.id);
  const cells = cameras.map((camera, index) => {
    const x = (index % shotSet.grid.columns) * cellWidth;
    const y = Math.floor(index / shotSet.grid.columns) * cellHeight;
    return `<g transform="translate(${x} ${y})">
  <rect width="${cellWidth}" height="${cellHeight}" fill="${index % 2 ? "#f1ece4" : "#f8f4ed"}" stroke="#b8ad9f" stroke-width="2"/>
  <text x="42" y="70" font-family="Arial, sans-serif" font-size="42" fill="#4b211f">${index + 1}. ${escapeXml(camera.label)}</text>
  <text x="42" y="132" font-family="Arial, sans-serif" font-size="28" fill="#413a33">${escapeXml(run.archetype.name)}</text>
  <text x="42" y="182" font-family="Arial, sans-serif" font-size="24" fill="#6f655d">${escapeXml(run.sceneId)}</text>
  <text x="42" y="242" font-family="Arial, sans-serif" font-size="22" fill="#6f655d">${escapeXml(run.archetype.focus)}</text>
</g>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="100%" height="100%" fill="#fbf7ef"/>
${cells}
<text x="42" y="1170" font-family="Arial, sans-serif" font-size="22" fill="#6f655d">Prompt saved separately. This placeholder spends no product API limits.</text>
<desc>${escapeXml(prompt.slice(0, 1200))}</desc>
</svg>
`;
}

function renderTileSvg({ run, camera, index }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600" viewBox="0 0 900 600">
<rect width="100%" height="100%" fill="${index % 2 ? "#f1ece4" : "#f8f4ed"}"/>
<rect x="28" y="28" width="844" height="544" fill="none" stroke="#b8ad9f" stroke-width="2"/>
<text x="64" y="96" font-family="Arial, sans-serif" font-size="44" fill="#4b211f">${index + 1}. ${escapeXml(camera.label)}</text>
<text x="64" y="164" font-family="Arial, sans-serif" font-size="30" fill="#413a33">${escapeXml(run.archetype.name)}</text>
<text x="64" y="218" font-family="Arial, sans-serif" font-size="25" fill="#6f655d">${escapeXml(run.sceneId)}</text>
<text x="64" y="284" font-family="Arial, sans-serif" font-size="24" fill="#6f655d">${escapeXml(run.archetype.focus)}</text>
<text x="64" y="520" font-family="Arial, sans-serif" font-size="22" fill="#6f655d">Replace with a generated Codex/chat crop for visual scoring.</text>
</svg>
`;
}

function normalizeImageExtension(extension) {
  const value = extension.toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"].includes(value)) return value === ".jpeg" ? ".jpg" : value;
  return ".jpg";
}

function qaRunId(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeMarkdownCell(value) {
  return String(value || "").replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

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

async function collagesFromArgs(args) {
  const collages = new Map();
  for (const value of getAll(args.collage)) {
    const [sceneId, archetypeId, ...fileParts] = String(value).split(":");
    const filePath = fileParts.join(":");
    if (!sceneId || !archetypeId || !filePath) {
      throw new Error("Use --collage sceneId:archetypeId:/path/to/contact-sheet.jpg");
    }
    collages.set(`${sceneId}:${archetypeId}`, filePath);
  }
  if (args["collage-dir"]) {
    const directory = path.resolve(String(args["collage-dir"]));
    const files = await fs.readdir(directory);
    for (const run of buildRunMatrix()) {
      const match = files.find((file) => {
        const lower = file.toLowerCase();
        return lower.includes(run.sceneId.toLowerCase()) && lower.includes(run.archetype.id.toLowerCase());
      });
      if (match) collages.set(run.key, path.join(directory, match));
    }
  }
  return collages;
}

async function issueRowsFromArgs(args) {
  if (!args.issues) return [];
  const filePath = path.resolve(String(args.issues));
  const text = await fs.readFile(filePath, "utf8");
  const [headerLine, ...lines] = text.split(/\r?\n/).filter(Boolean);
  const headers = headerLine.split("\t").map((header) => header.trim());
  return lines.map((line) => {
    const values = line.split("\t");
    const row = {};
    for (const [index, header] of headers.entries()) {
      row[header] = values[index]?.trim() ?? "";
    }
    return row;
  }).filter((row) => row.collage && row.frame);
}

function getAll(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const collageInputs = await collagesFromArgs(args);
  const issueRows = await issueRowsFromArgs(args);
  const result = await createSimulationBatch({
    rootDir: root,
    collageInputs,
    issueRows,
    promptCards: args["no-prompt-cards"] !== true,
  });
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || error);
    process.exit(1);
  });
}
