#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { CAMERA_RECIPES, SCENES, buildSofaPrompt } from "../server/prompts.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env.local"), quiet: true });
dotenv.config({ path: path.join(root, ".env"), quiet: true });

const IMAGE_RE = /\.(jpe?g|png|webp)$/i;
const args = parseArgs(process.argv.slice(2));
const sofaId = String(args.sofa || "2");
const sceneId = String(args.scene || "ugcHerringboneLiving");
const shots = parseList(args.shots, ["detail", "elevated", "room"]);
const inputDir = path.resolve(root, String(args.input || "qa/input-sofas"));
const passportPath = args.passport ? path.resolve(root, String(args.passport)) : null;
const scene = SCENES[sceneId];

if (!scene) throw new Error(`Unknown scene: ${sceneId}`);
for (const shot of shots) {
  if (!CAMERA_RECIPES[shot]) throw new Error(`Unknown camera shot: ${shot}`);
}

const useEnterprise =
  process.env.GOOGLE_GENAI_USE_ENTERPRISE === "true" ||
  process.env.GOOGLE_GENAI_USE_VERTEXAI === "true";
const enterprise =
  useEnterprise && process.env.GOOGLE_CLOUD_PROJECT && process.env.GOOGLE_CLOUD_LOCATION
    ? new GoogleGenAI({
        enterprise: true,
        project: process.env.GOOGLE_CLOUD_PROJECT,
        location: process.env.GOOGLE_CLOUD_LOCATION,
        apiVersion: "v1",
      })
    : null;
const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
const gemini = enterprise || (geminiKey ? new GoogleGenAI({ apiKey: geminiKey }) : null);
if (!gemini) throw new Error("GEMINI_API_KEY or Vertex Enterprise credentials are required.");

const sofa = await readSofa(sofaId);
const passport = passportPath ? JSON.parse(await fs.readFile(passportPath, "utf8")) : null;
const batchId = `${new Date().toISOString().replace(/[:.]/g, "-")}-c1-separated-${sceneId}-sofa-${sofa.id}`;
const batchFolder = path.join(root, "qa", "generation", batchId);
await fs.mkdir(path.join(batchFolder, "images"), { recursive: true });
await fs.mkdir(path.join(batchFolder, "prompts"), { recursive: true });
await fs.mkdir(path.join(batchFolder, "refs"), { recursive: true });

for (const [index, imagePath] of sofa.images.entries()) {
  await fs.copyFile(imagePath, path.join(batchFolder, "refs", `${String(index + 1).padStart(2, "0")}${normalizedExt(imagePath)}`));
}

const manifest = {
  id: batchId,
  createdAt: new Date().toISOString(),
  mode: "c1-separated-shots",
  sceneId,
  model: "gemini-3-pro-image",
  sofa: { id: sofa.id, sourceFolder: path.relative(root, sofa.folder), referenceCount: sofa.images.length },
  passport: passportPath ? path.relative(root, passportPath) : null,
  shots: [],
};

for (const shot of shots) {
  const angle = CAMERA_RECIPES[shot];
  const prompt = buildSeparatedPrompt({
    angle,
    passport,
    productReferenceCount: sofa.images.length,
    roomReferenceCount: scene.referenceImages?.length ?? 0,
  });
  await fs.writeFile(path.join(batchFolder, "prompts", `${shot}.txt`), prompt, "utf8");
  const startedAt = Date.now();
  let result;
  try {
    const response = await gemini.models.generateContent({
      model: "gemini-3-pro-image",
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            ...(await toGeminiParts(sofa.images)),
            ...(await toGeminiParts(await roomReferencePaths())),
          ],
        },
      ],
      config: {
        responseModalities: ["IMAGE"],
        imageConfig: {
          aspectRatio: shot === "room" ? "16:9" : "3:2",
          imageSize: "1K",
        },
      },
    });
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const image = parts.find((part) => part.inlineData?.data);
    if (!image?.inlineData?.data) {
      throw new Error(`GEMINI_IMAGE_DATA_MISSING: ${(response.text ?? "").slice(0, 500)}`);
    }
    const ext = image.inlineData.mimeType === "image/jpeg" ? ".jpg" : ".png";
    const outputPath = path.join(batchFolder, "images", `${shot}${ext}`);
    await fs.writeFile(outputPath, Buffer.from(image.inlineData.data, "base64"));
    result = {
      shot,
      status: "ok",
      output: path.relative(batchFolder, outputPath),
      usage: response.usageMetadata ?? null,
    };
  } catch (error) {
    result = { shot, status: "failed", error: safeError(error) };
  }
  result.latencyMs = Date.now() - startedAt;
  manifest.shots.push(result);
  console.log(`${shot}: ${result.status}${result.error ? ` (${result.error.message})` : ""}`);
}

await fs.writeFile(path.join(batchFolder, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ id: batchId, folder: batchFolder, ok: manifest.shots.filter((shot) => shot.status === "ok").length }, null, 2));

function buildSeparatedPrompt({ angle, passport, productReferenceCount, roomReferenceCount }) {
  const basePrompt = buildSofaPrompt({
    sceneId,
    angle,
    productReferenceCount,
    roomReferenceCount,
  });
  const passportText = passport ? JSON.stringify(passport.contract ?? passport, null, 2) : "No passport supplied.";
  return [
    `C1 SEPARATED SHOT EXPERIMENT — generate exactly one ${angle.label} image, not a contact sheet.`,
    "Use the uploaded sofa references as the highest authority. The Sofa Passport is a product contract, but the images outrank it if there is any conflict.",
    "CRITICAL WIDTH MAP FOR SOFA 2: the lower/base front is narrow-left / wide-center / narrow-right, not three equal thirds. The center lower drawer/panel is visibly wider than each side drawer/panel. Main lower vertical seams should sit closer to 25% and 75% of sofa width, not 33% and 66%.",
    "The sofa has 4 back cushions/channels spanning the 3-section base. Do not collapse the back into 3 large equal cushions. Do not align every back cushion to a lower drawer seam.",
    "For Detail, crop around a real construction junction that proves the width map: lower drawer face, pull tab, seat seam, arm edge, fabric texture and at least one adjacent module seam. Do not crop so tightly that the lower base geometry becomes unknowable.",
    "For Elevated and Room, keep the lower front face readable enough to verify the wide-center base. Do not hide the drawer seams behind perspective, shadow, rug crop, arm volume or camera height.",
    `SOFA PASSPORT CONTRACT:\n${passportText}`,
    basePrompt,
  ].join("\n\n");
}

async function readSofa(id) {
  const folder = path.join(inputDir, id);
  const files = (await fs.readdir(folder, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && IMAGE_RE.test(entry.name))
    .map((entry) => path.join(folder, entry.name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b), undefined, { numeric: true }));
  if (!files.length) throw new Error(`No images found in ${folder}`);
  return { id, folder, images: files };
}

async function roomReferencePaths() {
  return (scene.referenceImages ?? []).map((referencePath) => path.join(root, referencePath));
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

function safeError(error) {
  return {
    name: error?.name ?? "Error",
    message: error?.message ?? String(error),
    status: error?.status ?? error?.code ?? null,
  };
}
