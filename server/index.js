import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";
import OpenAI, { toFile } from "openai";
import {
  DEFAULT_GENERATION_MODEL_ID,
  GEMINI_IMAGE_PRICING_PER_MILLION,
  findGenerationModel,
} from "../shared/generationModels.js";
import { findShotSet } from "../shared/shotSets.js";
import { DEFAULT_IMAGE_FORMAT_ID, findImageFormat } from "../shared/imageFormats.js";
import {
  CAMERA_RECIPES,
  SCENES,
  buildContactSheetPrompt,
  buildPreviewFinalizePrompt,
  buildSofaPrompt,
  getCamerasForShotSet,
} from "./prompts.js";
import { JobStore } from "./job-store.js";
import { createQaExport } from "./qa-export.js";
import {
  GPT_IMAGE_2_PRICING_PER_MILLION,
  calculateImageCost,
  sumCosts,
} from "./pricing.js";
import {
  createBatchJob,
  editOneFabric,
  refreshBatchJob,
  summarizeSyncCosts,
  validateReupholsterInput,
} from "./reupholster.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env.local"), quiet: true });
dotenv.config({ path: path.join(root, ".env"), quiet: true });

const app = express();
const port = Number(process.env.PORT || 5173);
const corsOrigins = new Set(
  String(process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);
const jobStore = await new JobStore(root).load();
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 12, fileSize: 18 * 1024 * 1024 },
  fileFilter(_req, file, callback) {
    const allowed = allowedTypes.has(file.mimetype);
    callback(allowed ? null : new Error("UNSUPPORTED_IMAGE"), allowed);
  },
});

app.use((req, res, next) => {
  const origin = req.get("origin");
  if (origin && corsOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Vary", "Origin");
  }
  if (req.method === "OPTIONS" && origin && corsOrigins.has(origin)) return res.sendStatus(204);
  return next();
});

app.use(express.json({ limit: "60mb" }));

async function loadSceneReferenceImages(scene) {
  const references = scene.referenceImages ?? [];
  return Promise.all(
    references.map(async (referencePath, index) => {
      const absolutePath = path.join(root, referencePath);
      const buffer = await fs.readFile(absolutePath);
      const extension = path.extname(referencePath).toLowerCase();
      const type = extension === ".png" ? "image/png" : "image/jpeg";
      return toFile(buffer, `room-reference-${index + 1}${extension || ".jpg"}`, { type });
    }),
  );
}

async function loadSceneReferenceParts(scene) {
  const references = scene.referenceImages ?? [];
  return Promise.all(
    references.map(async (referencePath) => {
      const absolutePath = path.join(root, referencePath);
      const buffer = await fs.readFile(absolutePath);
      return bufferToGeminiPart(buffer, mimeTypeForPath(referencePath));
    }),
  );
}

function uploadedFileToGeminiPart(file) {
  return bufferToGeminiPart(file.buffer, file.mimetype);
}

function bufferToGeminiPart(buffer, mimeType) {
  return {
    inlineData: {
      data: buffer.toString("base64"),
      mimeType,
    },
  };
}

function mimeTypeForPath(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  return "image/jpeg";
}

function selectedGenerationModel(rawModelId) {
  return findGenerationModel(String(rawModelId || DEFAULT_GENERATION_MODEL_ID));
}

function validateGenerationModel(model) {
  if (!model) return { error: "Выберите доступную модель генерации.", code: "MODEL_NOT_SUPPORTED" };
  if (model.provider === "openai" && !process.env.OPENAI_API_KEY) {
    return {
      error: "Добавьте свежий OPENAI_API_KEY в .env.local и повторите попытку.",
      code: "API_KEY_MISSING",
    };
  }
  if (model.provider === "gemini" && !createGeminiClient()) {
    return {
      error: "Для Gemini добавьте GEMINI_API_KEY или GOOGLE_API_KEY в .env.local.",
      code: "GEMINI_API_KEY_MISSING",
    };
  }
  return null;
}

function createGeminiClient() {
  const useEnterprise =
    process.env.GOOGLE_GENAI_USE_ENTERPRISE === "true" ||
    process.env.GOOGLE_GENAI_USE_VERTEXAI === "true";
  if (useEnterprise && process.env.GOOGLE_CLOUD_PROJECT && process.env.GOOGLE_CLOUD_LOCATION) {
    return new GoogleGenAI({
      enterprise: true,
      project: process.env.GOOGLE_CLOUD_PROJECT,
      location: process.env.GOOGLE_CLOUD_LOCATION,
      apiVersion: "v1",
    });
  }
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  return apiKey ? new GoogleGenAI({ apiKey }) : null;
}

async function generateGeminiImage({ client, model, prompt, imageParts, aspectRatio }) {
  const response = await client.models.generateContent({
    model: model.model,
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }, ...imageParts],
      },
    ],
    config: {
      responseModalities: ["IMAGE"],
      imageConfig: {
        aspectRatio,
        imageSize: "1K",
      },
    },
  });
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const image = parts.find((part) => part.inlineData?.data);
  if (!image?.inlineData?.data) {
    throw new Error(`GEMINI_IMAGE_DATA_MISSING: ${(response.text ?? "").slice(0, 500)}`);
  }
  return {
    b64: image.inlineData.data,
    mimeType: image.inlineData.mimeType || "image/jpeg",
    cost: estimateGeminiCost(response.usageMetadata, model.model),
    usage: response.usageMetadata ?? null,
  };
}

async function generateOpenAIImage({
  client,
  model,
  imageInputs,
  prompt,
  outputCompression,
  inputFidelity = null,
  size = "1536x1024",
}) {
  const response = await client.images.edit(
    {
      model: model.model,
      image: imageInputs,
      prompt,
      ...(inputFidelity ? { input_fidelity: inputFidelity } : {}),
      size,
      quality: "medium",
      output_format: "jpeg",
      output_compression: outputCompression,
      moderation: "auto",
    },
    { timeout: 300_000 },
  );
  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error("OPENAI_IMAGE_DATA_MISSING");
  return {
    b64,
    mimeType: "image/jpeg",
    cost: calculateImageCost(response.usage),
    usage: response.usage ?? null,
  };
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    model: "gpt-image-2",
    keyConfigured: Boolean(process.env.OPENAI_API_KEY),
    models: {
      openai: Boolean(process.env.OPENAI_API_KEY),
      gemini: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
    },
  });
});

app.post("/api/generate-frame", upload.array("images", 6), async (req, res) => {
  const files = req.files ?? [];
  const sceneId = String(req.body.scene ?? "studio");
  const cameraId = String(req.body.camera ?? "hero");
  const imageFormat = findImageFormat(String(req.body.format ?? DEFAULT_IMAGE_FORMAT_ID));
  const generationModel = selectedGenerationModel(req.body.model);
  const modelError = validateGenerationModel(generationModel);
  const scene = SCENES[sceneId];
  const camera = CAMERA_RECIPES[cameraId];
  const revisionNote = String(req.body.revisionNote ?? "").trim();

  if (modelError) return res.status(modelError.code === "MODEL_NOT_SUPPORTED" ? 400 : 503).json(modelError);
  if (files.length < 1 || files.length > 6) return res.status(400).json({ error: "Загрузите от 1 до 6 фотографий дивана." });
  if (files.reduce((sum, file) => sum + file.size, 0) > 50 * 1024 * 1024) return res.status(400).json({ error: "Общий размер референсов должен быть не больше 50 МБ." });
  if (!scene) return res.status(400).json({ error: "Выберите доступное помещение." });
  if (!camera) return res.status(400).json({ error: "Выберите доступный ракурс." });
  if (!imageFormat) return res.status(400).json({ error: "Выберите доступный формат фотографии." });
  if (revisionNote.length > 1_000) return res.status(400).json({ error: "Уточнение должно быть не длиннее 1000 символов." });

  try {
    const prompt = buildSofaPrompt({
      sceneId,
      angle: camera,
      hasConsistencyAnchor: false,
      productReferenceCount: files.length,
      roomReferenceCount: 0,
      textOnlyBackground: true,
      revisionNote,
      outputFormat: imageFormat,
    });
    const openai = generationModel.provider === "openai" ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
    const gemini = generationModel.provider === "gemini" ? createGeminiClient() : null;
    const productImages = generationModel.provider === "openai"
      ? await Promise.all(files.map((file, index) => toFile(
          file.buffer,
          file.originalname || `sofa-reference-${index + 1}.jpg`,
          { type: file.mimetype },
        )))
      : [];
    const productParts = generationModel.provider === "gemini"
      ? files.map((file) => uploadedFileToGeminiPart(file))
      : [];
    const generatedImage = generationModel.provider === "gemini"
      ? await generateGeminiImage({
          client: gemini,
          model: generationModel,
          prompt,
          imageParts: productParts,
          aspectRatio: imageFormat.geminiAspectRatio,
        })
      : await generateOpenAIImage({
          client: openai,
          model: generationModel,
          imageInputs: productImages,
          prompt,
          outputCompression: 94,
          size: imageFormat.openaiSize,
        });

    return res.json({
      dataUrl: `data:${generatedImage.mimeType};base64,${generatedImage.b64}`,
      camera: { id: camera.id, label: camera.label },
      scene: scene.name,
      sceneId,
      model: generationModel.model,
      modelId: generationModel.id,
      modelName: generationModel.label,
      provider: generationModel.provider,
      quality: generationModel.quality,
      format: { id: imageFormat.id, label: imageFormat.label, ratio: imageFormat.ratio },
      useRoomReferences: false,
      revisionNote,
      cost: toCostPayload(generatedImage.cost, generationModel),
      qa: {
        source: "api-single-frame",
        prompt,
        productReferenceCount: files.length,
        roomReferenceCount: 0,
        format: imageFormat,
      },
    });
  } catch (error) {
    logGenerationError("Single frame generation failed", error);
    const message = String(error?.message ?? "");
    const fallback = /GEMINI_IMAGE_DATA_MISSING/i.test(message)
      ? "Gemini не вернул выбранный кадр. Попробуйте повторить или выбрать другую модель."
      : "Модель не завершила выбранный кадр.";
    return res.status(error?.status >= 400 && error?.status < 600 ? error.status : 502).json({
      error: openAIErrorMessage(error, fallback),
      requestId: openAIRequestId(error),
    });
  }
});

app.post("/api/generate", upload.array("images", 6), async (req, res) => {
  const files = req.files ?? [];
  const sceneId = String(req.body.scene ?? "studio");
  const shotSet = findShotSet(String(req.body.shotSet ?? "quick"));
  const generationModel = selectedGenerationModel(req.body.model);
  const modelError = validateGenerationModel(generationModel);

  if (modelError) {
    return res.status(modelError.code === "MODEL_NOT_SUPPORTED" ? 400 : 503).json(modelError);
  }
  if (files.length < 1 || files.length > 6) {
    return res.status(400).json({ error: "Загрузите от 1 до 6 фотографий дивана." });
  }
  if (files.reduce((sum, file) => sum + file.size, 0) > 50 * 1024 * 1024) {
    return res.status(400).json({ error: "Общий размер референсов должен быть не больше 50 МБ." });
  }
  if (!SCENES[sceneId]) {
    return res.status(400).json({ error: "Выберите доступное помещение." });
  }
  if (!shotSet) {
    return res.status(400).json({ error: "Выберите доступный набор кадров." });
  }

  try {
    const openai = generationModel.provider === "openai"
      ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      : null;
    const gemini = generationModel.provider === "gemini" ? createGeminiClient() : null;
    const sourceImages = generationModel.provider === "openai" ? await Promise.all(
      files.map((file, index) =>
        toFile(file.buffer, file.originalname || `sofa-reference-${index + 1}.jpg`, {
          type: file.mimetype,
        }),
      ),
    ) : [];
    const sourceParts = generationModel.provider === "gemini"
      ? files.map((file) => uploadedFileToGeminiPart(file))
      : [];
    const roomReferenceImages = generationModel.provider === "openai"
      ? await loadSceneReferenceImages(SCENES[sceneId])
      : [];
    const roomReferenceParts = generationModel.provider === "gemini"
      ? await loadSceneReferenceParts(SCENES[sceneId])
      : [];
    const baseImageInputs = [...sourceImages, ...roomReferenceImages];
    const baseImageParts = [...sourceParts, ...roomReferenceParts];
    const selectedAngles = getCamerasForShotSet(shotSet.id);
    res.status(200);
    res.set({
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    const writeEvent = (event) => {
      if (!res.writableEnded) res.write(`${JSON.stringify(event)}\n`);
    };
    const generated = [];
    const failed = [];

    writeEvent({
      type: "started",
      model: generationModel.model,
      modelId: generationModel.id,
      modelName: generationModel.label,
      provider: generationModel.provider,
      scene: SCENES[sceneId].name,
      count: selectedAngles.length,
      shotSet: {
        id: shotSet.id,
        name: shotSet.name,
        summary: shotSet.summary,
      },
      quality: generationModel.quality,
      angles: selectedAngles.map(({ id, label }, index) => ({ id, label, index })),
    });

    async function generateAngle(angle, imageInputs, imageParts, hasConsistencyAnchor) {
      try {
        const prompt = buildSofaPrompt({
          sceneId,
          angle,
          hasConsistencyAnchor,
          productReferenceCount: files.length,
          roomReferenceCount: (SCENES[sceneId].referenceImages ?? []).length,
        });
        const generatedImage = generationModel.provider === "gemini"
          ? await generateGeminiImage({
              client: gemini,
              model: generationModel,
              prompt,
              imageParts,
              aspectRatio: "3:2",
            })
          : await generateOpenAIImage({
              client: openai,
              model: generationModel,
              imageInputs,
              prompt,
              outputCompression: 92,
            });
        const b64 = generatedImage.b64;
        if (!b64) throw new Error("IMAGE_DATA_MISSING");
        return {
          ok: true,
          id: angle.id,
          label: angle.label,
          dataUrl: `data:${generatedImage.mimeType};base64,${b64}`,
          rawBase64: b64,
          cost: generatedImage.cost,
        };
      } catch (error) {
        return { ok: false, angle, error };
      }
    }

    function publishAttempt(attempt, index) {
      if (!attempt.ok) {
        failed.push({ ...attempt, index });
        return;
      }

      generated.push({ ...attempt, index });
      const runningCost = sumCosts(generated.map((item) => item.cost));
      writeEvent({
        type: "image",
        image: {
          id: attempt.id,
          label: attempt.label,
          index,
          dataUrl: attempt.dataUrl,
        },
        cost: toCostPayload(runningCost, generationModel),
      });
    }

    const primaryAttempt = await generateAngle(selectedAngles[0], baseImageInputs, baseImageParts, false);
    publishAttempt(primaryAttempt, 0);
    await mapWithConcurrency(
      selectedAngles.slice(1),
      2,
      async (angle, offset) => {
        const attempt = await generateAngle(angle, baseImageInputs, baseImageParts, false);
        publishAttempt(attempt, offset + 1);
        return attempt;
      },
    );
    if (generated.length === 0) throw failed[0]?.error || new Error("GENERATION_FAILED");
    const totalCost = sumCosts(generated.map((item) => item.cost));
    writeEvent({
      type: "complete",
      warning:
        failed.length > 0
          ? `Готово ${generated.length} из ${selectedAngles.length} кадров. За незавершённые ракурсы стоимость не добавлена.`
          : null,
      failed: failed.map(({ angle, index }) => ({
        id: angle.id,
        label: angle.label,
        index,
      })),
      cost: toCostPayload(totalCost, generationModel),
    });
    return res.end();
  } catch (error) {
    const requestId = error?.request_id || error?.headers?.["x-request-id"];
    console.error("Image generation failed", {
      requestId,
      status: error?.status,
      code: error?.code,
      message: error?.message,
    });
    const message =
      error?.code === "moderation_blocked"
        ? "Запрос не прошёл проверку безопасности. Попробуйте другие исходные фотографии."
        : error?.status === 401
          ? "API-ключ недействителен или был отозван. Добавьте свежий project key."
          : error?.status === 429
            ? "Достигнут лимит API. Проверьте квоту проекта и попробуйте позже."
            : "OpenAI не завершил генерацию. Повторите попытку.";

    const payload = { error: message, code: error?.code || "GENERATION_FAILED", requestId };
    if (res.headersSent) {
      if (!res.writableEnded) {
        res.write(`${JSON.stringify({ type: "error", ...payload })}\n`);
        res.end();
      }
      return;
    }

    return res
      .status(error?.status >= 400 && error?.status < 600 ? error.status : 502)
      .json(payload);
  }
});

app.post("/api/contact-sheet", upload.array("images", 6), async (req, res) => {
  const files = req.files ?? [];
  const sceneId = String(req.body.scene ?? "studio");
  const shotSet = findShotSet(String(req.body.shotSet ?? "quick"));
  const generationModel = selectedGenerationModel(req.body.model);
  const modelError = validateGenerationModel(generationModel);
  const startedAt = Date.now();

  if (modelError) {
    return res.status(modelError.code === "MODEL_NOT_SUPPORTED" ? 400 : 503).json(modelError);
  }
  if (files.length < 1 || files.length > 6) {
    return res.status(400).json({ error: "Загрузите от 1 до 6 фотографий дивана." });
  }
  if (files.reduce((sum, file) => sum + file.size, 0) > 50 * 1024 * 1024) {
    return res.status(400).json({ error: "Общий размер референсов должен быть не больше 50 МБ." });
  }
  if (!SCENES[sceneId]) {
    return res.status(400).json({ error: "Выберите доступное помещение." });
  }
  if (!shotSet) {
    return res.status(400).json({ error: "Выберите доступный набор кадров." });
  }

  try {
    console.info("Contact sheet generation started", {
      sceneId,
      shotSetId: shotSet.id,
      productReferences: files.length,
      model: generationModel.model,
      provider: generationModel.provider,
    });
    const prompt = buildContactSheetPrompt({
      sceneId,
      shotSetId: shotSet.id,
      productReferenceCount: files.length,
      roomReferenceCount: (SCENES[sceneId].referenceImages ?? []).length,
    });
    const generatedImage = generationModel.provider === "gemini"
      ? await generateGeminiImage({
          client: createGeminiClient(),
          model: generationModel,
          prompt,
          imageParts: [
            ...files.map((file) => uploadedFileToGeminiPart(file)),
            ...(await loadSceneReferenceParts(SCENES[sceneId])),
          ],
          aspectRatio: shotSet.grid.columns === 2 ? "3:2" : "16:9",
        })
      : await generateOpenAIImage({
          client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
          model: generationModel,
          imageInputs: [
            ...(await Promise.all(
              files.map((file, index) =>
                toFile(file.buffer, file.originalname || `sofa-reference-${index + 1}.jpg`, {
                  type: file.mimetype,
                }),
              ),
            )),
            ...(await loadSceneReferenceImages(SCENES[sceneId])),
          ],
          prompt,
          outputCompression: 90,
        });
    const b64 = generatedImage.b64;
    if (!b64) throw new Error("IMAGE_DATA_MISSING");
    console.info("Contact sheet generation completed", {
      sceneId,
      shotSetId: shotSet.id,
      model: generationModel.model,
      durationMs: Date.now() - startedAt,
    });
    return res.json({
      model: generationModel.model,
      modelId: generationModel.id,
      modelName: generationModel.label,
      provider: generationModel.provider,
      scene: SCENES[sceneId].name,
      shotSet: { id: shotSet.id, name: shotSet.name, summary: shotSet.summary },
      grid: shotSet.grid,
      cells: getCamerasForShotSet(shotSet.id).map(({ id, label }, index) => ({ id, label, index })),
      contactSheet: { dataUrl: `data:${generatedImage.mimeType};base64,${b64}` },
      qa: {
        source: `api-preview-${generationModel.provider}`,
        sceneId,
        shotSetId: shotSet.id,
        prompt,
        prompts: { "contact-sheet": prompt },
      },
      cost: toCostPayload(generatedImage.cost, generationModel),
    });
  } catch (error) {
    logGenerationError("Contact sheet generation failed", error);
    const debug = contactSheetDebugPayload(error, Date.now() - startedAt);
    return res.status(error?.status >= 400 && error?.status < 600 ? error.status : 502).json({
      error: contactSheetErrorMessage(error),
      code: error?.code || "CONTACT_SHEET_FAILED",
      requestId: openAIRequestId(error),
      ...(process.env.NODE_ENV !== "production" ? { debug } : {}),
    });
  }
});

app.post(
  "/api/finalize-preview",
  upload.fields([
    { name: "productImages", maxCount: 6 },
    { name: "previewImages", maxCount: 6 },
  ]),
  async (req, res) => {
    const productFiles = req.files?.productImages ?? [];
    const previewFiles = req.files?.previewImages ?? [];
    const sceneId = String(req.body.scene ?? "studio");
    const shotSet = findShotSet(String(req.body.shotSet ?? "quick"));
    const previewMeta = parseJsonField(req.body.previewMeta, []);
    const generationModel = selectedGenerationModel(req.body.model);
    const modelError = validateGenerationModel(generationModel);

    if (modelError) {
      return res.status(modelError.code === "MODEL_NOT_SUPPORTED" ? 400 : 503).json(modelError);
    }
    if (productFiles.length < 1 || productFiles.length > 6) {
      return res.status(400).json({ error: "Загрузите от 1 до 6 фотографий дивана." });
    }
    if (!shotSet) {
      return res.status(400).json({ error: "Выберите доступный набор кадров." });
    }
    const selectedAngles = getCamerasForShotSet(shotSet.id);
    if (previewFiles.length !== selectedAngles.length) {
      return res.status(400).json({ error: "Preview-lock требует все кадры выбранной раскадровки." });
    }
    const totalSize = [...productFiles, ...previewFiles].reduce((sum, file) => sum + file.size, 0);
    if (totalSize > 70 * 1024 * 1024) {
      return res.status(400).json({ error: "Общий размер референсов и preview должен быть не больше 70 МБ." });
    }
    if (!SCENES[sceneId]) {
      return res.status(400).json({ error: "Выберите доступное помещение." });
    }

    try {
      const openai = generationModel.provider === "openai"
        ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
        : null;
      const gemini = generationModel.provider === "gemini" ? createGeminiClient() : null;
      const sourceImages = generationModel.provider === "openai" ? await Promise.all(
        productFiles.map((file, index) =>
          toFile(file.buffer, file.originalname || `sofa-reference-${index + 1}.jpg`, {
            type: file.mimetype,
          }),
        ),
      ) : [];
      const sourceParts = generationModel.provider === "gemini"
        ? productFiles.map((file) => uploadedFileToGeminiPart(file))
        : [];
      const roomReferenceImages = generationModel.provider === "openai"
        ? await loadSceneReferenceImages(SCENES[sceneId])
        : [];
      const roomReferenceParts = generationModel.provider === "gemini"
        ? await loadSceneReferenceParts(SCENES[sceneId])
        : [];
      res.status(200);
      res.set({
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      res.flushHeaders();

      const writeEvent = (event) => {
        if (!res.writableEnded) res.write(`${JSON.stringify(event)}\n`);
      };
      const generated = [];
      const failed = [];

      writeEvent({
        type: "started",
        source: "preview-lock",
        model: generationModel.model,
        modelId: generationModel.id,
        modelName: generationModel.label,
        provider: generationModel.provider,
        scene: SCENES[sceneId].name,
        count: selectedAngles.length,
        shotSet: {
          id: shotSet.id,
          name: shotSet.name,
          summary: shotSet.summary,
        },
        quality: generationModel.quality,
        angles: selectedAngles.map(({ id, label }, index) => ({ id, label, index })),
      });

      async function finalizeAngle(angle, previewFile, index) {
        try {
          const extension = extensionForMime(previewFile.mimetype);
          const prompt = buildPreviewFinalizePrompt({
            sceneId,
            angle,
            productReferenceCount: productFiles.length,
            roomReferenceCount: (SCENES[sceneId].referenceImages ?? []).length,
          });
          const generatedImage = generationModel.provider === "gemini"
            ? await generateGeminiImage({
                client: gemini,
                model: generationModel,
                prompt,
                imageParts: [
                  ...sourceParts,
                  ...roomReferenceParts,
                  uploadedFileToGeminiPart(previewFile),
                ],
                aspectRatio: "3:2",
              })
            : await generateOpenAIImage({
                client: openai,
                model: generationModel,
                imageInputs: [
                  ...sourceImages,
                  ...roomReferenceImages,
                  await toFile(
                    previewFile.buffer,
                    previewFile.originalname || `preview-${String(index + 1).padStart(2, "0")}-${angle.id}${extension}`,
                    { type: previewFile.mimetype },
                  ),
                ],
                prompt,
                outputCompression: 94,
                inputFidelity: "high",
              });
          const b64 = generatedImage.b64;
          if (!b64) throw new Error("IMAGE_DATA_MISSING");
          const meta = previewMeta[index] ?? {};
          return {
            ok: true,
            id: meta.id || angle.id,
            label: meta.label || angle.label,
            dataUrl: `data:${generatedImage.mimeType};base64,${b64}`,
            rawBase64: b64,
            cost: generatedImage.cost,
          };
        } catch (error) {
          return { ok: false, angle, error };
        }
      }

      function publishAttempt(attempt, index) {
        if (!attempt.ok) {
          failed.push({ ...attempt, index });
          return;
        }
        generated.push({ ...attempt, index });
        const runningCost = sumCosts(generated.map((item) => item.cost));
        writeEvent({
          type: "image",
          image: {
            id: attempt.id,
            label: attempt.label,
            index,
            dataUrl: attempt.dataUrl,
          },
          cost: toCostPayload(runningCost, generationModel),
        });
      }

      await mapWithConcurrency(selectedAngles, 2, async (angle, index) => {
        const attempt = await finalizeAngle(angle, previewFiles[index], index);
        publishAttempt(attempt, index);
        return attempt;
      });
      if (generated.length === 0) throw failed[0]?.error || new Error("PREVIEW_FINALIZE_FAILED");
      const totalCost = sumCosts(generated.map((item) => item.cost));
      writeEvent({
        type: "complete",
        warning:
          failed.length > 0
            ? `Готово ${generated.length} из ${selectedAngles.length} preview-lock кадров. За незавершённые ракурсы стоимость не добавлена.`
            : null,
        failed: failed.map(({ angle, index }) => ({
          id: angle.id,
          label: angle.label,
          index,
        })),
        cost: toCostPayload(totalCost, generationModel),
      });
      return res.end();
    } catch (error) {
      logGenerationError("Preview-lock finalization failed", error);
      const payload = {
        error: openAIErrorMessage(error, "Модель не завершила улучшение выбранного preview."),
        code: error?.code || "PREVIEW_FINALIZE_FAILED",
        requestId: openAIRequestId(error),
      };
      if (res.headersSent) {
        if (!res.writableEnded) {
          res.write(`${JSON.stringify({ type: "error", ...payload })}\n`);
          res.end();
        }
        return;
      }
      return res
        .status(error?.status >= 400 && error?.status < 600 ? error.status : 502)
        .json(payload);
    }
  },
);

app.post("/api/qa-export", async (req, res) => {
  try {
    const shotSet = findShotSet(String(req.body.shotSetId ?? req.body.shotSet ?? "quick"));
    if (!shotSet) return res.status(400).json({ error: "Выберите доступный набор кадров." });
    const sceneId = String(req.body.sceneId ?? req.body.scene ?? "studio");
    if (!SCENES[sceneId]) return res.status(400).json({ error: "Выберите доступное помещение." });

    const storyboard = req.body.storyboard ?? {};
    const images = Array.isArray(storyboard.images) ? storyboard.images : [];
    const artifacts = [];
    if (storyboard.contactSheet?.dataUrl) {
      artifacts.push({
        name: "preview-collage",
        label: "Preview contact sheet",
        role: "contact-sheet",
        dataUrl: storyboard.contactSheet.dataUrl,
      });
    }
    for (const image of images) {
      artifacts.push({
        name: `tile-${String(Number(image.index ?? artifacts.length)).padStart(2, "0")}-${image.id || "frame"}`,
        label: `${image.label || image.id || "Frame"} preview tile`,
        role: "preview-tile",
        dataUrl: image.dataUrl,
      });
    }

    const exported = await createQaExport({
      root,
      source: String(req.body.source ?? "api-preview"),
      sceneId,
      shotSetId: shotSet.id,
      cost: req.body.cost ?? null,
      notes: String(req.body.notes ?? ""),
      prompts: req.body.prompts ?? {},
      artifacts,
    });
    return res.json({ export: exported });
  } catch (error) {
    console.error("QA export failed", { message: error?.message });
    return res.status(400).json({ error: error?.message || "Не удалось сохранить QA-папку." });
  }
});

app.post("/api/reupholster", upload.array("images", 6), async (req, res) => {
  const files = req.files ?? [];
  const fabricId = String(req.body.fabricId ?? "");
  const mode = String(req.body.mode ?? "sync");
  let meta = [];
  try {
    meta = JSON.parse(String(req.body.meta ?? "[]"));
  } catch {
    return res.status(400).json({ error: "Не удалось прочитать описание кадров." });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: "OPENAI_API_KEY не настроен.", code: "API_KEY_MISSING" });
  }
  const validation = validateReupholsterInput({ files, fabricId, mode });
  if (validation.error) return res.status(400).json({ error: validation.error });
  const fabric = validation.fabric;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  if (mode === "batch") {
    try {
      const job = await createBatchJob({ client, root, files, fabric, meta });
      await jobStore.set(job);
      return res.status(202).json({ job: publicJob(job) });
    } catch (error) {
      logOpenAIError("Fabric batch creation failed", error);
      return res.status(error?.status >= 400 && error?.status < 600 ? error.status : 502).json({
        error: openAIErrorMessage(error, "Не удалось поставить экономную обработку в очередь."),
        code: error?.code || "BATCH_CREATION_FAILED",
        requestId: openAIRequestId(error),
      });
    }
  }

  res.status(200);
  res.set({
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  const writeEvent = (event) => {
    if (!res.writableEnded) res.write(`${JSON.stringify(event)}\n`);
  };
  const completed = [];
  const failed = [];
  writeEvent({
    type: "started",
    model: "gpt-image-2",
    quality: "medium",
    count: files.length,
    fabric: { id: fabric.id, name: fabric.name, tone: fabric.tone },
  });

  await mapWithConcurrency(files, 2, async (file, index) => {
    const sourceMeta = {
      id: meta[index]?.id ?? `image-${index + 1}`,
      label: meta[index]?.label ?? `Кадр ${index + 1}`,
      originalIndex: Number(meta[index]?.originalIndex ?? index),
    };
    try {
      const edited = await editOneFabric({ client, root, file, fabric });
      completed.push({ ...sourceMeta, ...edited });
      writeEvent({
        type: "image",
        image: { ...sourceMeta, dataUrl: edited.dataUrl },
        cost: toCostPayload(summarizeSyncCosts(completed)),
      });
    } catch (error) {
      failed.push({ ...sourceMeta, error });
      logOpenAIError("Fabric edit failed", error);
    }
  });

  if (completed.length === 0) {
    const error = failed[0]?.error;
    writeEvent({
      type: "error",
      error: openAIErrorMessage(error, "OpenAI не завершил замену ткани."),
      code: error?.code || "REUPHOLSTER_FAILED",
      requestId: openAIRequestId(error),
    });
    return res.end();
  }
  writeEvent({
    type: "complete",
    failed: failed.map(({ error: _error, ...item }) => item),
    warning: failed.length ? `Готово ${completed.length} из ${files.length} кадров.` : null,
    cost: toCostPayload(summarizeSyncCosts(completed)),
  });
  return res.end();
});

app.get("/api/reupholster/jobs/:jobId", async (req, res) => {
  const job = jobStore.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Задание не найдено или уже удалено." });
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: "OPENAI_API_KEY не настроен.", code: "API_KEY_MISSING" });
  }
  try {
    const refreshed = await refreshBatchJob(new OpenAI({ apiKey: process.env.OPENAI_API_KEY }), job);
    await jobStore.set(refreshed);
    return res.json({ job: publicJob(refreshed) });
  } catch (error) {
    logOpenAIError("Fabric batch refresh failed", error);
    return res.status(error?.status >= 400 && error?.status < 600 ? error.status : 502).json({
      error: openAIErrorMessage(error, "Не удалось обновить статус экономной обработки."),
      requestId: openAIRequestId(error),
    });
  }
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(root, "dist")));
  app.get("*splat", (_req, res) => res.sendFile(path.join(root, "dist", "index.html")));
} else {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    root,
    server: {
      middlewareMode: true,
      hmr: {
        host: "127.0.0.1",
        port: Number(process.env.VITE_HMR_PORT || port + 20_000),
      },
    },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

app.use((error, _req, res, _next) => {
  const message =
    error?.code === "LIMIT_FILE_SIZE"
      ? "Каждый файл должен быть не больше 18 МБ."
      : error?.message === "UNSUPPORTED_IMAGE"
        ? "Поддерживаются JPG, PNG и WebP."
        : "Не удалось прочитать загруженные файлы.";
  res.status(400).json({ error: message });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`SOFA.SHOT is running at http://127.0.0.1:${port}`);
});

async function mapWithConcurrency(items, limit, task) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await task(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function parseJsonField(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function extensionForMime(mime) {
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  return ".jpg";
}

function toCostPayload(totalCost, model = null) {
  const provider = model?.provider ?? "openai";
  const ratesPerMillion =
    provider === "gemini"
      ? GEMINI_IMAGE_PRICING_PER_MILLION[model.model] ?? null
      : GPT_IMAGE_2_PRICING_PER_MILLION;
  return {
    usd: Number(totalCost.usd.toFixed(6)),
    display: `$${totalCost.usd.toFixed(4)}`,
    exact: totalCost.exact,
    provider,
    model: model?.model ?? "gpt-image-2",
    pricingNote: totalCost.pricingNote ?? null,
    tokens: totalCost.tokens,
    ratesPerMillion,
    pricingDate: provider === "gemini" ? "benchmark-estimate" : "2026-06-23",
  };
}

function publicJob(job) {
  return {
    id: job.id,
    status: job.status,
    fabricId: job.fabricId,
    fabricName: job.fabricName,
    createdAt: job.createdAt,
    expiresAt: job.expiresAt,
    updatedAt: job.updatedAt,
    expectedCount: job.expectedCount,
    estimatedCost: job.estimatedCost,
    requestCounts: job.requestCounts,
    images: job.images ?? [],
    errors: job.errors ?? [],
  };
}

function openAIRequestId(error) {
  return error?.request_id || error?.headers?.["x-request-id"];
}

function logOpenAIError(label, error) {
  console.error(label, {
    requestId: openAIRequestId(error),
    status: error?.status,
    code: error?.code,
    message: error?.message,
  });
}

function logGenerationError(label, error) {
  console.error(label, {
    requestId: openAIRequestId(error),
    status: error?.status,
    code: error?.code,
    message: error?.message,
  });
}

function openAIErrorMessage(error, fallback) {
  if (error?.code === "moderation_blocked") return "Запрос не прошёл проверку безопасности.";
  if (error?.status === 401) return "API-ключ недействителен или был отозван.";
  if (error?.status === 429) return "Достигнут лимит API. Проверьте квоту проекта.";
  return fallback;
}

function contactSheetErrorMessage(error) {
  const message = String(error?.message ?? "");
  if (/GEMINI_API_KEY|GOOGLE_API_KEY/i.test(message)) {
    return "Для Gemini добавьте GEMINI_API_KEY или GOOGLE_API_KEY в .env.local.";
  }
  if (/GEMINI_IMAGE_DATA_MISSING/i.test(message)) {
    return "Gemini не вернул изображение для preview-коллажа. Попробуйте другую модель или повторите запрос.";
  }
  if (/timed?\s*out|timeout/i.test(message)) {
    return "Модель слишком долго собирала preview-коллаж и запрос истёк. Можно повторить превью или сразу создать финальные кадры.";
  }
  if (/connection|fetch failed|network/i.test(message)) {
    return "Соединение с моделью оборвалось во время preview-коллажа. Повторите запрос или запустите финальные кадры напрямую.";
  }
  return openAIErrorMessage(error, "Модель не завершила превью раскадровки.");
}

function contactSheetDebugPayload(error, durationMs) {
  return {
    durationMs,
    status: error?.status,
    code: error?.code,
    message: error?.message,
    requestId: openAIRequestId(error),
  };
}

function estimateGeminiCost(usage, model) {
  const rates = GEMINI_IMAGE_PRICING_PER_MILLION[model];
  if (!usage || !rates) {
    return {
      usd: 0,
      exact: false,
      pricingNote: "Gemini usage metadata unavailable; Cloud Billing is authoritative.",
      tokens: { textInput: 0, imageInput: 0, imageOutput: 0, textOutput: 0, total: 0 },
    };
  }
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
    pricingNote: "Estimated from Gemini usageMetadata and benchmark pricing assumptions; Cloud Billing is authoritative.",
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
      if (modality.includes("image")) return { ...total, image: total.image + count };
      return { ...total, text: total.text + count };
    },
    { text: 0, image: 0 },
  );
}
