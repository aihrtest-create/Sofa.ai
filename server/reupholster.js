import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { toFile } from "openai";
import { getFabric } from "../shared/fabrics.js";
import { calculateImageCost, sumCosts } from "./pricing.js";

export const BATCH_ESTIMATE_PER_IMAGE_USD = 0.045;
const TERMINAL_BATCH_STATUSES = new Set(["completed", "failed", "expired", "cancelled"]);

export function buildReupholsterPrompt(fabric) {
  if (!fabric) throw new Error("UNKNOWN_FABRIC");
  const { color, structure, pile, sheen, scale } = fabric.traits;
  return [
    "EDIT TARGET — Image 1 is the original finished furniture photograph. Image 2 is the sole visual material reference. Return one edited commercial photograph.",
    "GEOMETRY AND SCENE LOCK — preserve the original image composition and camera exactly: sofa silhouette and proportions; module, arm, back, seat and cushion geometry; cushion inventory and placement; seams, piping, tufting and stitch paths; legs and all non-upholstered components; room, props, floor, walls, lighting, shadows, reflections, perspective, crop, depth of field and color grading. Do not add, remove, move, resize, beautify or redesign anything. Do not change any pixels outside the sofa's upholstered textile surfaces except the minimal edge blending required for a natural photograph.",
    `MATERIAL TRANSFER — replace only the sofa's existing upholstered textile with the ${fabric.name} preset shown in Image 2. Use this exact material character: color ${color}; structure ${structure}; pile ${pile}; response ${sheen}; physical scale ${scale}. Apply it consistently to every upholstered arm, seat, back, structural cushion, loose cushion, piping and fabric-covered panel. Respect seam boundaries, cushion compression, curvature, occlusion, perspective, local illumination and shadowing. The fabric must wrap physically around forms; never paste a flat texture over the image.`,
    "IDENTITY CHECK — the sofa must remain unmistakably the same physical product and the room must remain the same photograph. Legs, wood, metal, plastic, zippers and floor are not fabric. Avoid plastic texture, fake CGI sharpness, repeating tiles, oversized weave, warped seams, changed cushions, changed background, text, logos and watermarks.",
  ].join("\n\n");
}

export async function prepareFabricFile(root, fabric) {
  const fabricPath = path.join(root, "src", "assets", "fabrics", fabric.file);
  const buffer = await fs.promises.readFile(fabricPath);
  return toFile(buffer, fabric.file, { type: "image/jpeg" });
}

export async function editOneFabric({ client, root, file, fabric, quality = "medium" }) {
  const source = await toFile(file.buffer, file.originalname || "sofa-result.jpg", {
    type: file.mimetype,
  });
  const reference = await prepareFabricFile(root, fabric);
  const response = await client.images.edit({
    model: "gpt-image-2",
    image: [source, reference],
    prompt: buildReupholsterPrompt(fabric),
    size: "1536x1024",
    quality,
    output_format: "jpeg",
    output_compression: 92,
    moderation: "auto",
  });
  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error("IMAGE_DATA_MISSING");
  return {
    dataUrl: `data:image/jpeg;base64,${b64}`,
    cost: calculateImageCost(response.usage),
  };
}

export async function createBatchJob({ client, root, files, fabric, meta = [] }) {
  const jobId = crypto.randomUUID();
  const fabricPath = path.join(root, "src", "assets", "fabrics", fabric.file);
  const fabricDataUrl = `data:image/jpeg;base64,${(await fs.promises.readFile(fabricPath)).toString("base64")}`;
  const prompt = buildReupholsterPrompt(fabric);
  const requests = files.map((file, index) => ({
    custom_id: `${jobId}:${index}`,
    method: "POST",
    url: "/v1/responses",
    body: {
      model: "gpt-5.5",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            {
              type: "input_image",
              detail: "original",
              image_url: `data:${file.mimetype};base64,${file.buffer.toString("base64")}`,
            },
            { type: "input_image", detail: "original", image_url: fabricDataUrl },
          ],
        },
      ],
      tools: [
        {
          type: "image_generation",
          action: "edit",
          model: "gpt-image-2",
          size: "1536x1024",
          quality: "medium",
          output_format: "jpeg",
          output_compression: 92,
          moderation: "auto",
        },
      ],
      tool_choice: "required",
    },
  }));
  const jsonl = requests.map((request) => JSON.stringify(request)).join("\n");
  const batchFile = await client.files.create({
    file: await toFile(Buffer.from(jsonl), `reupholster-${jobId}.jsonl`, {
      type: "application/jsonl",
    }),
    purpose: "batch",
  });
  const batch = await client.batches.create({
    input_file_id: batchFile.id,
    endpoint: "/v1/responses",
    completion_window: "24h",
    metadata: { feature: "sofa-reupholster", jobId, fabricId: fabric.id },
  });
  return {
    id: jobId,
    batchId: batch.id,
    inputFileId: batchFile.id,
    status: batch.status,
    fabricId: fabric.id,
    fabricName: fabric.name,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    expectedCount: files.length,
    estimatedCost: Number((files.length * BATCH_ESTIMATE_PER_IMAGE_USD).toFixed(3)),
    meta: files.map((file, index) => ({
      index,
      id: meta[index]?.id ?? `image-${index + 1}`,
      label: meta[index]?.label ?? `Кадр ${index + 1}`,
      originalIndex: Number(meta[index]?.originalIndex ?? index),
    })),
    images: [],
    errors: [],
  };
}

export async function refreshBatchJob(client, job) {
  if (job.hydratedAt) return job;
  if (TERMINAL_BATCH_STATUSES.has(job.status) && job.status !== "completed") {
    if (!job.cleanedAt && job.inputFileId) {
      await Promise.allSettled([client.files.delete(job.inputFileId)]);
      return { ...job, cleanedAt: new Date().toISOString() };
    }
    return job;
  }
  const batch = await client.batches.retrieve(job.batchId);
  const next = {
    ...job,
    status: batch.status,
    requestCounts: batch.request_counts ?? null,
    updatedAt: new Date().toISOString(),
  };
  if (batch.status !== "completed" || !batch.output_file_id) return next;

  const response = await client.files.content(batch.output_file_id);
  const lines = (await response.text()).split("\n").filter(Boolean);
  const images = [];
  const errors = [];
  for (const line of lines) {
    const item = JSON.parse(line);
    const index = Number(String(item.custom_id ?? "").split(":").at(-1));
    const sourceMeta = job.meta[index] ?? { index, id: `image-${index + 1}`, label: `Кадр ${index + 1}` };
    if (item.error || item.response?.status_code >= 400) {
      errors.push({ ...sourceMeta, message: item.error?.message ?? item.response?.body?.error?.message ?? "Batch request failed" });
      continue;
    }
    const call = item.response?.body?.output?.find((output) => output.type === "image_generation_call");
    if (!call?.result) {
      errors.push({ ...sourceMeta, message: "Batch result did not contain an image" });
      continue;
    }
    images.push({ ...sourceMeta, dataUrl: `data:image/jpeg;base64,${call.result}` });
  }
  await Promise.allSettled([
    job.inputFileId ? client.files.delete(job.inputFileId) : Promise.resolve(),
    client.files.delete(batch.output_file_id),
  ]);
  return {
    ...next,
    status: errors.length === job.expectedCount ? "failed" : "completed",
    images: images.sort((a, b) => a.originalIndex - b.originalIndex),
    errors,
    outputFileId: batch.output_file_id,
    hydratedAt: new Date().toISOString(),
    cleanedAt: new Date().toISOString(),
  };
}

export function summarizeSyncCosts(items) {
  return sumCosts(items.map((item) => item.cost));
}

export function validateReupholsterInput({ files, fabricId, mode }) {
  const fabric = getFabric(fabricId);
  if (!fabric) return { error: "Выберите доступную ткань." };
  if (!files.length || files.length > 6) return { error: "Для примерки нужно от 1 до 6 готовых кадров." };
  if (!["sync", "batch"].includes(mode)) return { error: "Неизвестный режим обработки." };
  return { fabric };
}
