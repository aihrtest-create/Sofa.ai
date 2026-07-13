#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import OpenAI, { toFile } from "openai";
import { GoogleGenAI } from "@google/genai";
import { SCENES, buildContactSheetPrompt } from "../server/prompts.js";
import { calculateImageCost } from "../server/pricing.js";
import { getShotSet } from "../shared/shotSets.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env.local"), quiet: true });
dotenv.config({ path: path.join(root, ".env"), quiet: true });

const IMAGE_RE = /\.(jpe?g|png|webp)$/i;
const DEFAULT_VARIANTS = ["a1", "b1", "c1", "d1"];
const VARIANTS = Object.freeze({
  a1: {
    id: "a1",
    label: "A1 OpenAI gpt-image-2 + Sofa Passport",
    provider: "openai",
    model: "gpt-image-2",
  },
  b1: {
    id: "b1",
    label: "B1 Gemini 3.1 Flash Image + Sofa Passport",
    provider: "gemini",
    model: "gemini-3.1-flash-image",
  },
  c1: {
    id: "c1",
    label: "C1 Gemini 3 Pro Image + Sofa Passport",
    provider: "gemini",
    model: "gemini-3-pro-image",
  },
  d1: {
    id: "d1",
    label: "D1 Imagen product-image edit / background replacement",
    provider: "vertex",
    model: "imagen-3.0-capability-001",
  },
});

const GEMINI_IMAGE_PRICING_PER_MILLION = Object.freeze({
  // Vertex/Enterprise image-model estimates from current public pricing/model docs.
  // Billing export remains the source of truth; these numbers make benchmark rows comparable.
  "gemini-3.1-flash-image": {
    input: 0.5,
    outputText: 3,
    outputImage: 60,
  },
  "gemini-3-pro-image": {
    input: 2,
    outputText: 12,
    outputImage: 120,
  },
});

const args = parseArgs(process.argv.slice(2));
const sceneId = String(args.scene || "ugcHerringboneLiving");
const shotSet = getShotSet(String(args["shot-set"] || "quick"));
const inputDir = path.resolve(root, String(args.input || "qa/input-sofas"));
const selectedVariantIds = parseList(args.variants, DEFAULT_VARIANTS);
const selectedSofas = parseList(args.sofas, ["all"]);
const passportProvider = String(args["passport-provider"] || (process.env.GEMINI_API_KEY ? "gemini" : "openai"));
const judgeEnabled = args.judge === true || args.judge === "true";
const scene = SCENES[sceneId];

if (!scene) throw new Error(`Unknown scene: ${sceneId}`);
for (const id of selectedVariantIds) {
  if (!VARIANTS[id]) throw new Error(`Unknown variant: ${id}`);
}

const sofas = (await readInputSofas(inputDir)).filter((sofa) =>
  selectedSofas.includes("all") || selectedSofas.includes(sofa.id),
);
if (!sofas.length) throw new Error(`No matching sofa folders with images found in ${inputDir}`);

const batchId = `${new Date().toISOString().replace(/[:.]/g, "-")}-model-benchmark-${sceneId}-${shotSet.id}`;
const batchFolder = path.join(root, "qa", "generation", batchId);
await fs.mkdir(batchFolder, { recursive: true });
await fs.mkdir(path.join(batchFolder, "passports"), { recursive: true });
await fs.mkdir(path.join(batchFolder, "prompts"), { recursive: true });

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;
const useEnterprise =
  process.env.GOOGLE_GENAI_USE_ENTERPRISE === "true" ||
  process.env.GOOGLE_GENAI_USE_VERTEXAI === "true";
const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
const enterprise =
  useEnterprise && process.env.GOOGLE_CLOUD_PROJECT && process.env.GOOGLE_CLOUD_LOCATION
    ? new GoogleGenAI({
        enterprise: true,
        project: process.env.GOOGLE_CLOUD_PROJECT,
        location: process.env.GOOGLE_CLOUD_LOCATION,
        apiVersion: "v1",
      })
    : null;
const gemini = enterprise || (geminiKey ? new GoogleGenAI({ apiKey: geminiKey }) : null);

const manifest = {
  id: batchId,
  createdAt: new Date().toISOString(),
  sceneId,
  sceneName: scene.name,
  shotSet: { id: shotSet.id, name: shotSet.name, summary: shotSet.summary, grid: shotSet.grid },
  inputDir: path.relative(root, inputDir),
  sofas: sofas.map(({ id, folder, images }) => ({
    id,
    sourceFolder: path.relative(root, folder),
    referenceCount: images.length,
  })),
  variants: selectedVariantIds.map((id) => VARIANTS[id]),
  passportProvider,
  judgeEnabled,
  runs: [],
};

const costsRows = ["variant\tsofa\tmodel\tusd\texact\ttotal_tokens\tlatency_ms\tstatus"];
const judgeRows = [];

for (const sofa of sofas) {
  console.log(`Sofa ${sofa.id}: creating passport via ${passportProvider}`);
  const passport = await createPassport({ sofa, provider: passportProvider });
  const passportPath = path.join(batchFolder, "passports", `sofa-${sofa.id}.json`);
  await fs.writeFile(passportPath, `${JSON.stringify(passport, null, 2)}\n`, "utf8");

  for (const variantId of selectedVariantIds) {
    const variant = VARIANTS[variantId];
    const runFolder = path.join(batchFolder, "runs", variant.id, `sofa-${sofa.id}`);
    await fs.mkdir(path.join(runFolder, "images"), { recursive: true });
    await fs.mkdir(path.join(runFolder, "refs"), { recursive: true });

    for (const [index, imagePath] of sofa.images.entries()) {
      const ext = normalizedExt(imagePath);
      await fs.copyFile(imagePath, path.join(runFolder, "refs", `${String(index + 1).padStart(2, "0")}${ext}`));
    }

    const prompt = buildBenchmarkPrompt({ passport, variant });
    const promptPath = path.join(batchFolder, "prompts", `${variant.id}-sofa-${sofa.id}.txt`);
    await fs.writeFile(promptPath, prompt, "utf8");

    const startedAt = Date.now();
    let run;
    try {
      if (variant.provider === "openai") {
        run = await runOpenAIContactSheet({ sofa, variant, prompt, runFolder });
      } else if (variant.provider === "gemini") {
        run = await runGeminiContactSheet({ sofa, variant, prompt, runFolder });
      } else {
        run = await runVertexProductEdit({ sofa, variant, prompt, runFolder });
      }
    } catch (error) {
      run = {
        status: "failed",
        error: safeError(error),
      };
    }
    const latencyMs = Date.now() - startedAt;
    const runManifest = {
      variant: variant.id,
      variantLabel: variant.label,
      sofa: sofa.id,
      status: run.status,
      model: variant.model,
      prompt: path.relative(batchFolder, promptPath),
      passport: path.relative(batchFolder, passportPath),
      outputs: run.outputs ?? [],
      cost: run.cost ? { ...run.cost, display: formatUsd(run.cost.usd) } : null,
      usage: run.usage ?? null,
      latencyMs,
      error: run.error ?? null,
    };

    await fs.writeFile(path.join(runFolder, "manifest.json"), `${JSON.stringify(runManifest, null, 2)}\n`, "utf8");
    manifest.runs.push(runManifest);
    costsRows.push([
      variant.id,
      sofa.id,
      variant.model,
      runManifest.cost?.usd ?? "",
      runManifest.cost?.exact ?? "",
      runManifest.cost?.tokens?.total ?? "",
      latencyMs,
      runManifest.status,
    ].join("\t"));

    if (judgeEnabled && runManifest.status === "ok") {
      const judge = await passiveJudge({ sofa, passport, runManifest });
      judgeRows.push(JSON.stringify(judge));
    }

    console.log(`  ${variant.id}: ${runManifest.status}${runManifest.error ? ` (${runManifest.error.message})` : ""}`);
  }
}

await fs.writeFile(path.join(batchFolder, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
await fs.writeFile(path.join(batchFolder, "costs.tsv"), `${costsRows.join("\n")}\n`, "utf8");
await fs.writeFile(path.join(batchFolder, "judge-log.jsonl"), `${judgeRows.join("\n")}${judgeRows.length ? "\n" : ""}`, "utf8");
await fs.writeFile(path.join(batchFolder, "SUMMARY.md"), buildSummary(manifest), "utf8");

console.log(JSON.stringify({
  id: batchId,
  folder: batchFolder,
  summary: path.join(batchFolder, "SUMMARY.md"),
  ok: manifest.runs.filter((run) => run.status === "ok").length,
  skipped: manifest.runs.filter((run) => run.status === "skipped").length,
  failed: manifest.runs.filter((run) => run.status === "failed").length,
}, null, 2));

async function createPassport({ sofa, provider }) {
  const prompt = buildPassportPrompt(sofa);
  if (provider === "gemini") {
    if (!gemini) return missingPassport("gemini_api_key_missing", prompt);
    try {
      const response = await gemini.models.generateContent({
        model: "gemini-3.1-flash-lite",
        contents: [{ role: "user", parts: [{ text: prompt }, ...(await toGeminiParts(sofa.images))] }],
      });
      return parseJsonFromText(response.text, {
        provider,
        model: "gemini-3.1-flash-lite",
        usage: response.usageMetadata ?? null,
        prompt,
      });
    } catch (error) {
      return { ...missingPassport("gemini_passport_failed", prompt), error: safeError(error) };
    }
  }

  if (!openai) return missingPassport("openai_api_key_missing", prompt);
  const content = [
    { type: "input_text", text: prompt },
    ...(await Promise.all(
      sofa.images.map(async (imagePath) => ({
        type: "input_image",
        image_url: await dataUrl(imagePath),
      })),
    )),
  ];
  try {
    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [{ role: "user", content }],
      text: {
        format: {
          type: "json_schema",
          name: "sofa_passport",
          strict: false,
          schema: sofaPassportSchema(),
        },
      },
    });
    return parseJsonFromText(response.output_text, { provider, model: "gpt-4.1-mini", usage: response.usage, prompt });
  } catch (error) {
    return { ...missingPassport("openai_passport_failed", prompt), error: safeError(error) };
  }
}

async function runOpenAIContactSheet({ sofa, variant, prompt, runFolder }) {
  if (!openai) return skipped("OPENAI_API_KEY is not configured.");
  const response = await openai.images.edit(
    {
      model: variant.model,
      image: [...(await toOpenAIImages(sofa.images)), ...(await loadRoomReferenceFiles())],
      prompt,
      size: "1536x1024",
      quality: "medium",
      output_format: "jpeg",
      output_compression: 90,
      moderation: "auto",
    },
    { timeout: 300_000 },
  );
  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error("OPENAI_IMAGE_DATA_MISSING");
  const outputPath = path.join(runFolder, "images", "contact-sheet.jpg");
  await fs.writeFile(outputPath, Buffer.from(b64, "base64"));
  return {
    status: "ok",
    outputs: [{ role: "contact-sheet", path: path.relative(runFolder, outputPath) }],
    cost: calculateImageCost(response.usage),
  };
}

async function runGeminiContactSheet({ sofa, variant, prompt, runFolder }) {
  if (!gemini) return skipped("GEMINI_API_KEY or GOOGLE_API_KEY is not configured.");
  const response = await gemini.models.generateContent({
    model: variant.model,
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }, ...(await toGeminiParts(sofa.images)), ...(await toGeminiParts(await roomReferencePaths()))],
      },
    ],
    config: {
      responseModalities: ["IMAGE"],
      imageConfig: {
        aspectRatio: shotSet.grid.columns === 2 ? "3:2" : "16:9",
        imageSize: "1K",
      },
    },
  });
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const image = parts.find((part) => part.inlineData?.data);
  if (!image?.inlineData?.data) {
    throw new Error(`GEMINI_IMAGE_DATA_MISSING: ${(response.text ?? "").slice(0, 500)}`);
  }
  const ext = image.inlineData.mimeType === "image/png" ? ".png" : ".jpg";
  const outputPath = path.join(runFolder, "images", `contact-sheet${ext}`);
  await fs.writeFile(outputPath, Buffer.from(image.inlineData.data, "base64"));
  return {
    status: "ok",
    outputs: [{ role: "contact-sheet", path: path.relative(runFolder, outputPath) }],
    cost: estimateGeminiCost(response.usageMetadata, variant.model),
    usage: response.usageMetadata ?? null,
  };
}

async function runVertexProductEdit({ sofa, variant }) {
  if (!enterprise) {
    return skipped("GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION plus Application Default Credentials are required.");
  }
  return skipped(`D1 is configured for ${variant.model}, but product-image edit still needs a validated Vertex/Imagen call shape before spending.`);
}

async function passiveJudge({ sofa, passport, runManifest }) {
  return {
    sofa: sofa.id,
    variant: runManifest.variant,
    mode: "passive",
    overall: "unscored",
    note: "Passive judge placeholder: no retry or prompt change is performed.",
    passportStatus: passport.status ?? "ok",
  };
}

function buildBenchmarkPrompt({ passport, variant }) {
  const basePrompt = buildContactSheetPrompt({
    sceneId,
    shotSetId: shotSet.id,
    productReferenceCount: null,
    roomReferenceCount: scene.referenceImages?.length ?? 0,
  });
  const passportText = JSON.stringify(passport.contract ?? passport, null, 2);
  return [
    `BENCHMARK VARIANT ${variant.id.toUpperCase()} — ${variant.label}.`,
    "Use the sofa reference images as the highest authority. The Sofa Passport below is a structured reading of those same references; use it as an explicit product contract, not as a replacement for the images.",
    "If the passport says a detail is unknown or low confidence, do not invent a decorative version. Keep it hidden, shadowed, or minimally inferred.",
    "Before rendering, audit the sofa's horizontal construction in layers: lower/base modules, seat panels and back cushions. Preserve mismatched layer counts exactly. Do not convert a 3-base / 4-back-cushion sofa into three equal-size blocks.",
    "If the references show side modules that are narrower than a center module, keep the original width ratio such as narrow-left / wide-center / narrow-right. Do not equalize module widths for symmetry or catalogue neatness.",
    "For any narrow-left / wide-center / narrow-right lower base, the front-face seams must not sit at one-third and two-thirds. Place the two main vertical base seams closer to one-quarter and three-quarters of the sofa width, so the center drawer/panel is visibly wider than each side drawer/panel.",
    "For a 1:2:1 or similar base ratio, render the side modules as about 25-30% each and the center module as about 40-50%. The center pull tab belongs at the center of the wide center panel, not at the center of an equal third.",
    "Drawer fronts, pull tabs, vertical seams and cushion breaks are construction evidence. Use them to preserve the original width map; do not redistribute them into evenly spaced decorative panels.",
    "BOTTOM ROW FIDELITY LOCK: Detail, Elevated and Room cells must not simplify or recompose the sofa. Detail should crop around a real construction junction where the wide center lower module, drawer front, pull tab, seam, seat edge and back-cushion channels remain consistent with the references. Elevated and Room must keep the full sofa width map readable, with the wide center base still visibly wider than side bases. Do not hide the lower front behind perspective, crop, shadow, rug or arm volume.",
    `SOFA PASSPORT CONTRACT:\n${passportText}`,
    basePrompt,
  ].join("\n\n");
}

function buildPassportPrompt(sofa) {
  return [
    "You are extracting a strict product-fidelity contract for a sofa image-generation system.",
    `The input contains ${sofa.images.length} reference images of one physical sofa.`,
    "Return only valid JSON. Do not include markdown.",
    "Be conservative. If a feature is hidden or unclear, mark it unknown and lower confidence. Do not beautify the sofa.",
    "Capture exact product details that image generation must preserve: sofa type, orientation, section/module count, seat count, back cushion count, loose pillows, arm shape, base/underside, legs, fabric, seams, visible imperfections, market level, unknowns, and no-invent rules.",
    "The section geometry is mandatory. Describe modules beyond counts: left-to-right order, width class for each visible module, unequal module widths, chaise/ottoman/corner pieces, arm modules, gaps, cushion breaks, and whether the silhouette is symmetric or asymmetric.",
    "Audit horizontal geometry separately for base modules, seat panels, and back cushions. Do not let one layer's count overwrite another layer's count. A sofa may have 3 lower/base modules but 4 back cushions, or a wide center base module spanning two back cushions.",
    "Estimate relative widths left-to-right using simple ratios such as 1:1:1, 1:2:1, narrow-wide-narrow, or narrow-wide-wide-narrow. Only call modules identical-width when the image clearly supports equal pixel widths across their visible front faces.",
    "If a center lower module visually spans two cushion positions while the side modules span one each, write width_pattern: narrow-left / wide-center / narrow-right and include an explicit rule to preserve the wide center.",
    "When the source layout is asymmetric or has unequal module widths, include explicit no_equalization_rules: do not make narrow modules equal width, do not center or regularize unequal sections, and do not move the footprint to make a cleaner catalogue sofa.",
    "Sofa legs are a hard acceptance criterion. Preserve leg count, position, material, color, height, thickness, shape, and occlusion state. If a hidden leg is unknowable, say it is hidden/unknown and require it to stay occluded or minimally inferred.",
    "Use this JSON shape when possible: { product_summary, viewpoints, topology, section_geometry, horizontal_alignment_map, cushions, arms, base, legs, fabric, seams_and_construction, asymmetry, imperfections_to_preserve, market_level, unknowns, generation_contract, no_equalization_rules, leg_acceptance_criteria, confidence }.",
  ].join("\n");
}

function sofaPassportSchema() {
  return {
    type: "object",
    additionalProperties: true,
    properties: {
      sofa_type: { type: "string" },
      orientation: { type: "string" },
      seat_count: { type: ["number", "string", "null"] },
      back_cushion_count: { type: ["number", "string", "null"] },
      loose_pillow_count: { type: ["number", "string", "null"] },
      topology: { type: "object", additionalProperties: true },
      section_geometry: { type: "object", additionalProperties: true },
      horizontal_alignment_map: { type: "object", additionalProperties: true },
      cushions: { type: "object", additionalProperties: true },
      arms: { type: "object", additionalProperties: true },
      base: { type: "object", additionalProperties: true },
      legs: { type: "object", additionalProperties: true },
      fabric: { type: "object", additionalProperties: true },
      seams_and_construction: { type: "array", items: { type: "string" } },
      asymmetry: { type: "object", additionalProperties: true },
      imperfections_to_preserve: { type: "array", items: { type: "string" } },
      market_level: { type: "string" },
      unknowns: { type: "array", items: { type: "string" } },
      generation_contract: { type: "array", items: { type: "string" } },
      no_equalization_rules: { type: "array", items: { type: "string" } },
      leg_acceptance_criteria: { type: "array", items: { type: "string" } },
      confidence: { type: "object", additionalProperties: true },
    },
  };
}

function parseJsonFromText(text, meta) {
  try {
    return { status: "ok", provider: meta.provider, model: meta.model, contract: JSON.parse(text), usage: meta.usage ?? null };
  } catch {
    const match = String(text || "").match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return { status: "ok", provider: meta.provider, model: meta.model, contract: JSON.parse(match[0]), usage: meta.usage ?? null };
      } catch {
        // Fall through.
      }
    }
    return { status: "parse_failed", provider: meta.provider, model: meta.model, rawText: text };
  }
}

function missingPassport(reason, prompt) {
  return {
    status: "missing",
    reason,
    contract: {
      note: "No generated Sofa Passport was available; generation should rely on image references and base locks only.",
    },
    prompt,
  };
}

async function toOpenAIImages(imagePaths) {
  return Promise.all(
    imagePaths.map(async (imagePath, index) => {
      const buffer = await fs.readFile(imagePath);
      return toFile(buffer, `sofa-reference-${index + 1}${normalizedExt(imagePath)}`, {
        type: mimeType(imagePath),
      });
    }),
  );
}

async function loadRoomReferenceFiles() {
  return Promise.all(
    (await roomReferencePaths()).map(async (imagePath, index) => {
      const buffer = await fs.readFile(imagePath);
      return toFile(buffer, `room-reference-${index + 1}${normalizedExt(imagePath)}`, {
        type: mimeType(imagePath),
      });
    }),
  );
}

async function toGeminiParts(imagePaths) {
  return Promise.all(
    imagePaths.map(async (imagePath) => ({
      inlineData: {
        data: (await fs.readFile(imagePath)).toString("base64"),
        mimeType: mimeType(imagePath),
      },
    })),
  );
}

async function roomReferencePaths() {
  return (scene.referenceImages ?? []).map((referencePath) => path.join(root, referencePath));
}

async function dataUrl(imagePath) {
  return `data:${mimeType(imagePath)};base64,${(await fs.readFile(imagePath)).toString("base64")}`;
}

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

function buildSummary(batch) {
  const totalUsd = batch.runs.reduce((sum, run) => sum + Number(run.cost?.usd ?? 0), 0);
  const rows = batch.runs.map((run) => {
    const output = run.outputs?.[0]?.path
      ? `runs/${run.variant}/sofa-${run.sofa}/${run.outputs[0].path}`
      : "";
    const image = output ? `![${run.variant} sofa ${run.sofa}](${output})` : "";
    const note = run.error?.message ?? "";
    const estimateMark = run.cost?.exact === false ? " est." : "";
    return `| ${run.sofa} | ${run.variant} | ${run.status} | ${run.model} | ${run.cost?.display ?? ""}${estimateMark} | ${run.latencyMs} | ${note} |\n${image ? `\n${image}\n` : ""}`;
  }).join("\n");
  return `# Sofa.ai Model Benchmark ${batch.id}

- Scene: \`${batch.sceneName}\` (${batch.sceneId})
- Shot set: \`${batch.shotSet.name}\` (${batch.shotSet.summary})
- Passport provider: \`${batch.passportProvider}\`
- Passive judge: \`${batch.judgeEnabled ? "on" : "off"}\`
- Image-generation cost total: \`${formatUsd(totalUsd)}\`

## Results

| sofa | variant | status | model | cost | latency ms | note |
| --- | --- | --- | --- | ---: | ---: | --- |
${rows}
`;
}

function formatUsd(value) {
  return `$${Number(value || 0).toFixed(4)}`;
}

function estimateGeminiCost(usage, model) {
  if (!usage) return null;
  const rates = GEMINI_IMAGE_PRICING_PER_MILLION[model];
  if (!rates) return null;
  const prompt = tokensByModality(usage.promptTokensDetails);
  const candidates = tokensByModality(usage.candidatesTokensDetails);
  const inputTokens = Number(usage.promptTokenCount ?? 0);
  const outputText = candidates.text;
  const outputImage = candidates.image;
  const usd =
    (inputTokens * rates.input +
      outputText * rates.outputText +
      outputImage * rates.outputImage) /
    1_000_000;
  return {
    usd,
    exact: false,
    pricingNote: "Estimated from Gemini usageMetadata and public image-token pricing; Cloud Billing is authoritative.",
    tokens: {
      textInput: prompt.text,
      imageInput: prompt.image,
      imageOutput: outputImage,
      textOutput: outputText,
      total: Number(usage.totalTokenCount ?? inputTokens + outputText + outputImage),
    },
  };
}

function tokensByModality(details = []) {
  return details.reduce(
    (total, item) => {
      const modality = String(item.modality ?? "").toLowerCase();
      const count = Number(item.tokenCount ?? 0);
      if (modality === "image") total.image += count;
      else if (modality === "text") total.text += count;
      else total.other += count;
      return total;
    },
    { text: 0, image: 0, other: 0 },
  );
}

function skipped(message) {
  return { status: "skipped", error: { message } };
}

function safeError(error) {
  return {
    name: error?.name ?? "Error",
    message: error?.message ?? String(error),
    status: error?.status ?? error?.code ?? null,
    requestId: error?.request_id ?? error?.headers?.["x-request-id"] ?? null,
  };
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

function parseList(value, fallback) {
  if (value === undefined || value === null || value === true) return fallback;
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizedExt(imagePath) {
  const ext = path.extname(imagePath).toLowerCase();
  return ext === ".jpeg" ? ".jpg" : ext || ".jpg";
}

function mimeType(imagePath) {
  const ext = normalizedExt(imagePath);
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}
