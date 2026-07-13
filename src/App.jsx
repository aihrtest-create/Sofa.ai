import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Camera,
  Check,
  ClockCountdown,
  DownloadSimple,
  ArrowsOutSimple,
  ImagesSquare,
  Lightning,
  Plus,
  Rewind,
  ShieldCheck,
  Sparkle,
  Swatches,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import heroSofa from "./assets/hero-sofa-portrait.png";
import studioScene from "./assets/scene-studio.png";
import lightScene from "./assets/scene-light.png";
import warmScene from "./assets/scene-warm.png";
import ugcApartmentScene from "./assets/background-presets/ugc-apartment-window-main-iphone-clean.jpg";
import ugcHerringboneScene from "./assets/background-presets/ugc-herringbone-living-main-iphone-clean.jpg";
import { fabricPresets } from "./fabricPresets.js";
import { DEFAULT_GENERATION_MODEL_ID, GENERATION_MODELS } from "../shared/generationModels.js";
import { apiUrl } from "./api.js";
import { SHOT_SETS, getShotSet } from "../shared/shotSets.js";

const MAX_FILES = 6;
const MAX_FILE_SIZE = 18 * 1024 * 1024;
const MAX_TOTAL_SIZE = 50 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const scenes = [
  { id: "studio", name: "Студия", image: studioScene },
  { id: "light", name: "Светлый интерьер", image: lightScene },
  { id: "warm", name: "Тёплый интерьер", image: warmScene },
  { id: "ugcApartmentWindow", name: "UGC квартира", image: ugcApartmentScene },
  { id: "ugcHerringboneLiving", name: "UGC гостиная", image: ugcHerringboneScene },
];
const progressSteps = [
  "Изучаем форму и пропорции дивана",
  "Фиксируем ткань, швы и конструкцию",
  "Выстраиваем свет и перспективу",
  "Снимаем выбранные ракурсы",
];
const demoMode = import.meta.env.DEV ? new URLSearchParams(window.location.search).get("demo") : null;
const showResultsDemo = demoMode === "results" || demoMode === "preview";
const showPreviewDemo = demoMode === "preview";
const demoResult = showResultsDemo
  ? {
      model: "gpt-image-2",
      scene: "Студия",
      expectedCount: 4,
      shotSet: { id: "quick", name: "Быстрый сет", summary: "Hero · Front · Depth · Detail" },
      quality: "medium",
      angles: [
        { id: "hero", label: "Hero", index: 0 },
        { id: "front", label: "Front", index: 1 },
        { id: "depth", label: "Depth", index: 2 },
        { id: "detail", label: "Detail", index: 3 },
      ],
      images: [
        { id: "hero", label: "Hero", index: 0, dataUrl: heroSofa },
        { id: "front", label: "Front", index: 1, dataUrl: lightScene },
        { id: "depth", label: "Depth", index: 2, dataUrl: warmScene },
        { id: "detail", label: "Detail", index: 3, dataUrl: studioScene },
      ],
      failed: [],
      warning: null,
      cost: { display: "$0.2874", tokens: { total: 18_942 } },
    }
  : null;
const demoStoryboard = showPreviewDemo
  ? {
      model: "gpt-image-2",
      scene: "Студия",
      shotSet: { id: "quick", name: "Быстрый сет", summary: "Hero · Front · Depth · Detail" },
      grid: { columns: 2, rows: 2 },
      cells: [
        { id: "hero", label: "Hero", index: 0 },
        { id: "front", label: "Front", index: 1 },
        { id: "depth", label: "Depth", index: 2 },
        { id: "detail", label: "Detail", index: 3 },
      ],
      contactSheet: { dataUrl: heroSofa },
      images: [
        { id: "hero", label: "Hero", index: 0, dataUrl: heroSofa },
        { id: "front", label: "Front", index: 1, dataUrl: lightScene },
        { id: "depth", label: "Depth", index: 2, dataUrl: warmScene },
        { id: "detail", label: "Detail", index: 3, dataUrl: studioScene },
      ],
      qa: { source: "codex-simulation", sceneId: "studio", shotSetId: "quick", prompts: {} },
      cost: { display: "$0.0803", tokens: { total: 5_316 } },
    }
  : null;

export function App() {
  const [files, setFiles] = useState([]);
  const [scene, setScene] = useState("studio");
  const [shotSetId, setShotSetId] = useState("quick");
  const [generationModelId, setGenerationModelId] = useState(DEFAULT_GENERATION_MODEL_ID);
  const [status, setStatus] = useState(showResultsDemo ? "done" : "idle");
  const [generationMode, setGenerationMode] = useState("independent");
  const [progressIndex, setProgressIndex] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState(demoResult);
  const [storyboardStatus, setStoryboardStatus] = useState(showPreviewDemo ? "done" : "idle");
  const [storyboard, setStoryboard] = useState(demoStoryboard);
  const [storyboardError, setStoryboardError] = useState("");
  const [storyboardElapsed, setStoryboardElapsed] = useState(0);
  const [storyboardViewer, setStoryboardViewer] = useState(null);
  const [qaStatus, setQaStatus] = useState("idle");
  const [qaExport, setQaExport] = useState(null);
  const [fabricId, setFabricId] = useState(fabricPresets[0].id);
  const [fabricStatus, setFabricStatus] = useState(showPreviewDemo ? "preview-ready" : "idle");
  const [fabricImages, setFabricImages] = useState(showPreviewDemo ? { hero: heroSofa } : {});
  const [fabricError, setFabricError] = useState("");
  const [fabricCost, setFabricCost] = useState(0);
  const [fabricJob, setFabricJob] = useState(null);
  const fileInputRef = useRef(null);
  const resultsRef = useRef(null);

  const previews = useMemo(
    () => files.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [files],
  );

  useEffect(() => () => previews.forEach(({ url }) => URL.revokeObjectURL(url)), [previews]);

  useEffect(() => {
    if (status !== "generating") return undefined;
    const timer = window.setInterval(
      () => setProgressIndex((current) => Math.min(current + 1, progressSteps.length - 1)),
      9_000,
    );
    return () => window.clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if (storyboardStatus !== "generating") return undefined;
    setStoryboardElapsed(0);
    const timer = window.setInterval(
      () => setStoryboardElapsed((current) => current + 1),
      1_000,
    );
    return () => window.clearInterval(timer);
  }, [storyboardStatus]);

  useEffect(() => {
    if (!fabricJob || ["completed", "failed", "expired", "cancelled"].includes(fabricJob.status)) {
      return undefined;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(apiUrl(`/api/reupholster/jobs/${fabricJob.id}`));
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Не удалось обновить статус задания.");
        if (cancelled) return;
        setFabricJob(data.job);
        if (data.job.status === "completed") {
          setFabricImages((current) => ({
            ...current,
            ...Object.fromEntries(data.job.images.map((image) => [image.id, image.dataUrl])),
          }));
          setFabricStatus("complete");
          window.localStorage.removeItem("sofa-shot-fabric-job");
        } else if (["failed", "expired", "cancelled"].includes(data.job.status)) {
          setFabricStatus("error");
          setFabricError("Экономная обработка не завершилась. Можно запустить кадры сразу.");
          window.localStorage.removeItem("sofa-shot-fabric-job");
        }
      } catch (pollError) {
        if (!cancelled) setFabricError(pollError.message);
      }
    };
    poll();
    const timer = window.setInterval(poll, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [fabricJob?.id, fabricJob?.status]);

  function addFiles(nextFiles) {
    setError("");
    const incoming = Array.from(nextFiles);
    if (incoming.some((file) => !ALLOWED_TYPES.has(file.type))) {
      setError("Поддерживаются JPG, PNG и WebP.");
      return;
    }
    if (incoming.some((file) => file.size > MAX_FILE_SIZE)) {
      setError("Каждый файл должен быть не больше 18 МБ.");
      return;
    }
    if (files.length + incoming.length > MAX_FILES) {
      setError("Можно загрузить не больше 6 фотографий.");
      return;
    }
    if ([...files, ...incoming].reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL_SIZE) {
      setError("Общий размер референсов должен быть не больше 50 МБ.");
      return;
    }
    setFiles((current) => [...current, ...incoming]);
  }

  async function generate() {
    if (files.length === 0 || status === "generating") return;
    setGenerationMode("independent");
    setStatus("generating");
    setProgressIndex(0);
    setError("");
    setResult(null);
    resetFabricSession();
    const body = new FormData();
    files.forEach((file) => body.append("images", file));
    body.append("scene", scene);
    body.append("shotSet", shotSetId);
    body.append("model", generationModelId);

    try {
      const response = await fetch(apiUrl("/api/generate"), { method: "POST", body });
      await handleGenerationResponse(response, "Генерация не завершилась.");
    } catch (generationError) {
      setError(generationError.message);
      setStatus("error");
    }
  }

  async function finalizePreview() {
    if (files.length === 0 || !storyboard?.images?.length || status === "generating") return;
    setGenerationMode("preview-lock");
    setStatus("generating");
    setProgressIndex(0);
    setError("");
    setResult(null);
    resetFabricSession();
    const body = new FormData();
    files.forEach((file) => body.append("productImages", file));
    for (const image of storyboard.images) {
      const blob = await (await fetch(image.dataUrl)).blob();
      body.append("previewImages", blob, `preview-${String(image.index + 1).padStart(2, "0")}-${image.id}.jpg`);
    }
    body.append("scene", scene);
    body.append("shotSet", shotSetId);
    body.append("model", generationModelId);
    body.append(
      "previewMeta",
      JSON.stringify(storyboard.images.map(({ id, label, index }) => ({ id, label, index }))),
    );

    try {
      const response = await fetch(apiUrl("/api/finalize-preview"), { method: "POST", body });
      await handleGenerationResponse(response, "Улучшение превью не завершилось.");
    } catch (finalizeError) {
      setError(finalizeError.message);
      setStatus("error");
    }
  }

  async function handleGenerationResponse(response, fallbackMessage) {
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.includes("application/x-ndjson")) {
      const data = await readJsonResponse(response);
      throw new Error(data.error || fallbackMessage);
    }
    if (!response.body) throw new Error("Браузер не поддерживает потоковую генерацию.");
    let receivedFirstImage = false;
    await readNdjson(response.body, (event) => {
      if (event.type === "started") {
        setResult({
          source: event.source || "independent",
          model: event.model,
          modelId: event.modelId,
          modelName: event.modelName,
          provider: event.provider,
          scene: event.scene,
          expectedCount: event.count,
          shotSet: event.shotSet,
          quality: event.quality,
          angles: event.angles,
          images: [],
          failed: [],
          warning: null,
          cost: null,
        });
        return;
      }

      if (event.type === "image") {
        setResult((current) => ({
          ...current,
          images: [...current.images.filter((image) => image.id !== event.image.id), event.image]
            .sort((a, b) => a.index - b.index),
          cost: event.cost,
        }));
        if (!receivedFirstImage) {
          receivedFirstImage = true;
          window.setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth" }), 120);
        }
        return;
      }

      if (event.type === "complete") {
        setResult((current) => ({
          ...current,
          failed: event.failed || [],
          warning: event.warning,
          cost: event.cost,
        }));
        setStatus("done");
        return;
      }

      if (event.type === "error") {
        throw new Error(event.error || fallbackMessage);
      }
    });
  }

  async function previewStoryboard() {
    if (files.length === 0 || storyboardStatus === "generating" || status === "generating") return;
    setStoryboardStatus("generating");
    setStoryboardError("");
    setStoryboard(null);
    setQaStatus("idle");
    setQaExport(null);
    setStoryboardElapsed(0);
    const body = new FormData();
    files.forEach((file) => body.append("images", file));
    body.append("scene", scene);
    body.append("shotSet", shotSetId);
    body.append("model", generationModelId);

    try {
      const response = await fetch(apiUrl("/api/contact-sheet"), { method: "POST", body });
      const data = await readJsonResponse(response);
      if (!response.ok) {
        throw new Error(formatPreviewError(data));
      }
      const images = await cropContactSheet(data.contactSheet.dataUrl, data.grid, data.cells);
      setStoryboard({ ...data, images });
      setStoryboardStatus("done");
    } catch (previewError) {
      setStoryboardStatus("error");
      setStoryboardError(previewError.message);
    }
  }

  async function exportPreviewQa() {
    if (!storyboard || qaStatus === "saving") return;
    setQaStatus("saving");
    setStoryboardError("");
    try {
      const response = await fetch(apiUrl("/api/qa-export"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: storyboard.qa?.source ?? "api-preview",
          sceneId: scene,
          shotSetId,
          cost: storyboard.cost ?? null,
          model: storyboard.model,
          modelId: storyboard.modelId,
          prompts: storyboard.qa?.prompts ?? {},
          notes: "Saved from the Sofa.ai preview contact sheet UI before preview-lock finalization.",
          storyboard: {
            contactSheet: storyboard.contactSheet,
            images: storyboard.images.map(({ id, label, index, dataUrl }) => ({ id, label, index, dataUrl })),
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "QA-папка не сохранена.");
      setQaExport(data.export);
      setQaStatus("saved");
    } catch (qaError) {
      setQaStatus("error");
      setStoryboardError(qaError.message);
    }
  }

  function downloadImage(image, index) {
    downloadDataUrl(image.dataUrl, `sofa-shot-${index + 1}-${image.id}.jpg`);
  }

  function downloadPreviewCollage() {
    if (!storyboard?.contactSheet?.dataUrl) return;
    downloadDataUrl(storyboard.contactSheet.dataUrl, `sofa-preview-${storyboard.shotSet.id}.jpg`);
  }

  function downloadPreviewImage(image) {
    downloadDataUrl(image.dataUrl, `sofa-preview-${String(image.index + 1).padStart(2, "0")}-${image.id}.jpg`);
  }

  function resetFabricSession(nextFabricId = fabricId) {
    setFabricId(nextFabricId);
    setFabricStatus("idle");
    setFabricImages({});
    setFabricError("");
    setFabricCost(0);
    setFabricJob(null);
    window.localStorage.removeItem("sofa-shot-fabric-job");
  }

  async function reupholsterSync(images, nextStatus) {
    if (!images.length) return;
    setFabricStatus(nextStatus);
    setFabricError("");
    const body = await buildFabricForm(images, "sync");
    try {
      const response = await fetch(apiUrl("/api/reupholster"), { method: "POST", body });
      const contentType = response.headers.get("content-type") || "";
      if (!response.ok || !contentType.includes("application/x-ndjson")) {
        const data = await response.json();
        throw new Error(data.error || "Замена ткани не завершилась.");
      }
      if (!response.body) throw new Error("Браузер не поддерживает потоковую генерацию.");
      let latestCost = null;
      await readNdjson(response.body, (event) => {
        if (event.type === "image") {
          latestCost = event.cost;
          setFabricImages((current) => ({ ...current, [event.image.id]: event.image.dataUrl }));
        }
        if (event.type === "complete") latestCost = event.cost;
        if (event.type === "error") throw new Error(event.error || "Замена ткани не завершилась.");
      });
      if (latestCost) setFabricCost((current) => current + latestCost.usd);
      setFabricStatus(images.length === 1 ? "preview-ready" : "complete");
    } catch (editError) {
      setFabricStatus("error");
      setFabricError(editError.message);
    }
  }

  async function reupholsterBatch(images) {
    if (!images.length) return;
    setFabricStatus("queueing");
    setFabricError("");
    try {
      const response = await fetch(apiUrl("/api/reupholster"), {
        method: "POST",
        body: await buildFabricForm(images, "batch"),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось поставить кадры в очередь.");
      setFabricJob(data.job);
      setFabricStatus("batch");
      window.localStorage.setItem("sofa-shot-fabric-job", data.job.id);
    } catch (batchError) {
      setFabricStatus("error");
      setFabricError(batchError.message);
    }
  }

  async function buildFabricForm(images, mode) {
    const body = new FormData();
    const meta = [];
    for (const image of images) {
      const blob = await (await fetch(image.dataUrl)).blob();
      body.append("images", blob, `${image.id}.jpg`);
      meta.push({ id: image.id, label: image.label, originalIndex: image.index });
    }
    body.append("fabricId", fabricId);
    body.append("mode", mode);
    body.append("meta", JSON.stringify(meta));
    return body;
  }

  const selectedGenerationModel = GENERATION_MODELS.find((model) => model.id === generationModelId) ?? GENERATION_MODELS[0];
  const selectedFabric = fabricPresets.find((fabric) => fabric.id === fabricId) ?? fabricPresets[0];
  const selectedShotSet = getShotSet(shotSetId);
  const primaryImage = result?.images?.[0] ?? null;
  const remainingImages = result?.images?.slice(1) ?? [];
  const previewReady = Boolean(primaryImage && fabricImages[primaryImage.id]);
  const fabricBusy = ["previewing", "applying", "queueing", "batch"].includes(fabricStatus);

  return (
    <main>
      <section className="studio-shell" aria-label="Создание фотосессии">
        <div className="workspace">
          <header className="brand-block">
            <p className="brand">SOFA.SHOT</p>
            <p className="brand-caption">Фотостудия для мебели</p>
            <span className="brand-rule" aria-hidden="true" />
            <h1>Профессиональные фотографии<br />вашего дивана в один клик.</h1>
          </header>

          <div className="workflow">
            <section className="workflow-step upload-step">
              <StepHeading number="1" title="Загрузите фото дивана" />
              <p className="step-note">Добавьте от 1 до 6 референсов. Чем больше ракурсов — тем точнее результат.</p>
              <div
                className="upload-row"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  addFiles(event.dataTransfer.files);
                }}
              >
                {Array.from({ length: MAX_FILES }, (_, index) => {
                  const preview = previews[index];
                  return preview ? (
                    <div className="upload-tile filled" key={`${preview.file.name}-${index}`}>
                      <img src={preview.url} alt={`Референс дивана ${index + 1}`} />
                      <button
                        className="remove-image"
                        type="button"
                        aria-label={`Удалить фото ${index + 1}`}
                        onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                      >
                        <X size={14} weight="bold" />
                      </button>
                      <span className="image-index">{index + 1}</span>
                    </div>
                  ) : (
                    <button
                      className="upload-tile"
                      type="button"
                      key={index}
                      onClick={() => fileInputRef.current?.click()}
                      aria-label={index === files.length ? "Добавить фото дивана" : `Свободное место ${index + 1}`}
                    >
                      {index === files.length ? <Plus size={26} weight="thin" /> : <Camera size={24} weight="thin" />}
                      {index === files.length && <span>Добавить фото</span>}
                    </button>
                  );
                })}
              </div>
              <input
                ref={fileInputRef}
                className="visually-hidden"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={(event) => {
                  addFiles(event.target.files);
                  event.target.value = "";
                }}
              />
            </section>

            <section className="workflow-step scene-step">
              <StepHeading number="2" title="Выберите окружение" />
              <div className="scene-grid" role="radiogroup" aria-label="Окружение">
                {scenes.map((item) => (
                  <button
                    className={`scene-option ${scene === item.id ? "selected" : ""}`}
                    type="button"
                    role="radio"
                    aria-checked={scene === item.id}
                    key={item.id}
                    onClick={() => {
                      setScene(item.id);
                      setStoryboard(null);
                      setStoryboardError("");
                      setQaStatus("idle");
                      setQaExport(null);
                    }}
                  >
                    <img src={item.image} alt="" />
                    <span>{item.name}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="workflow-step output-step">
              <StepHeading number="3" title="Раскадровка съёмки" />
              <div className="action-row">
                <div className="shot-set-switch" role="radiogroup" aria-label="Набор кадров">
                  {SHOT_SETS.map((shotSet) => (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={shotSetId === shotSet.id}
                      className={shotSetId === shotSet.id ? "active" : ""}
                      onClick={() => {
                        setShotSetId(shotSet.id);
                        setStoryboard(null);
                        setStoryboardError("");
                        setQaStatus("idle");
                        setQaExport(null);
                      }}
                      key={shotSet.id}
                    >
                      <strong>{shotSet.countLabel}</strong>
                      <small>{shotSet.name}</small>
                    </button>
                  ))}
                </div>
                <p className="shot-set-summary">{selectedShotSet.summary}</p>
                <div className="model-picker" role="radiogroup" aria-label="Модель генерации">
                  {GENERATION_MODELS.map((model) => (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={generationModelId === model.id}
                      className={generationModelId === model.id ? "selected" : ""}
                      onClick={() => setGenerationModelId(model.id)}
                      key={model.id}
                    >
                      <span>{model.badge}</span>
                      <strong>{model.shortLabel}</strong>
                      <small>{model.provider === "gemini" ? "Google" : "OpenAI"}</small>
                    </button>
                  ))}
                </div>
                <p className="model-note">{selectedGenerationModel.description}</p>
                <div className={`generate-line ${storyboard ? "has-storyboard" : ""}`}>
                  <div className={`generation-actions ${storyboard ? "has-storyboard" : ""}`}>
                    <button
                      className="preview-button"
                      type="button"
                      disabled={files.length === 0 || status === "generating" || storyboardStatus === "generating"}
                      onClick={previewStoryboard}
                    >
                      <ImagesSquare size={19} weight="light" />
                      <span>{storyboardStatus === "generating" ? "Собираем превью" : storyboard ? "Новое превью" : "Превью сетки"}</span>
                    </button>
                    {storyboard ? (
                      <>
                        <button
                          className="generate-button"
                          type="button"
                          disabled={files.length === 0 || status === "generating"}
                          onClick={finalizePreview}
                        >
                          {status === "generating" && generationMode === "preview-lock" ? "Улучшаем превью" : "Улучшить выбранное превью"}
                          {status === "generating" && generationMode === "preview-lock" ? <Sparkle size={21} weight="light" /> : <ArrowRight size={22} weight="light" />}
                        </button>
                        <button
                          className="reshoot-button"
                          type="button"
                          disabled={files.length === 0 || status === "generating"}
                          onClick={generate}
                        >
                          {status === "generating" && generationMode === "independent" ? "Переснимаем" : "Переснять заново"}
                        </button>
                      </>
                    ) : (
                      <button
                        className="generate-button"
                        type="button"
                        disabled={files.length === 0 || status === "generating"}
                        onClick={generate}
                      >
                        {status === "generating" ? "Создаём финальные кадры" : "Создать финал"}
                        {status === "generating" ? <Sparkle size={21} weight="light" /> : <ArrowRight size={22} weight="light" />}
                      </button>
                    )}
                  </div>
                  <div className="identity-note">
                    <ShieldCheck size={30} weight="light" />
                    <span>{storyboard ? "Preview фиксирует кадр; референсы фиксируют ножки." : "Дизайн вашего дивана будет сохранён без изменений."}</span>
                  </div>
                </div>
                {storyboardError && <p className="storyboard-error" role="alert">{storyboardError}</p>}
                {storyboardStatus === "generating" && (
                  <div className="storyboard-progress" role="status" aria-live="polite">
                    <span className="progress-orbit"><ImagesSquare size={18} /></span>
                    <div>
                      <strong>{storyboardProgressText(storyboardElapsed, selectedGenerationModel.shortLabel)}</strong>
                      <p>{selectedShotSet.name}. Обычно preview занимает 1-3 минуты; если модель зависнет, покажем точную ошибку.</p>
                    </div>
                    <span className="progress-count">{formatElapsed(storyboardElapsed)}</span>
                  </div>
                )}
                {storyboard && (
                  <div className="storyboard-preview" aria-label="Превью раскадровки">
                    <div className="storyboard-heading">
                      <div>
                        <span>{storyboard.shotSet.name}</span>
                        <small>{storyboard.modelName || storyboard.model || selectedGenerationModel.shortLabel} · нажмите кадр, чтобы открыть крупно</small>
                      </div>
                      <div className="storyboard-actions">
                        <strong>{storyboard.cost.display}</strong>
                        <button type="button" disabled={qaStatus === "saving"} onClick={exportPreviewQa}>
                          <DownloadSimple size={17} /> {qaStatus === "saving" ? "Сохраняем QA" : "Сохранить QA"}
                        </button>
                        <button type="button" onClick={downloadPreviewCollage}>
                          <DownloadSimple size={17} /> Скачать коллаж
                        </button>
                      </div>
                    </div>
                    {qaExport && <p className="qa-export-note">QA сохранено: {qaExport.id}</p>}
                    <div className={`storyboard-grid cells-${storyboard.images.length}`}>
                      {storyboard.images.map((image) => (
                        <figure key={image.id}>
                          <button
                            className="storyboard-frame"
                            type="button"
                            onClick={() => setStoryboardViewer(image)}
                            aria-label={`Открыть ${image.label} крупно`}
                          >
                            <img src={image.dataUrl} alt={`${image.label}: превью кадра`} />
                            <ArrowsOutSimple size={18} weight="light" />
                          </button>
                          <figcaption>
                            <span>{image.label}</span>
                            <button type="button" onClick={() => downloadPreviewImage(image)}>
                              <DownloadSimple size={15} /> Скачать
                            </button>
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>

            {status === "generating" && (
              <div className="progress-panel" role="status" aria-live="polite">
                <span className="progress-orbit"><Sparkle size={18} /></span>
                <div>
                  <strong>{progressSteps[progressIndex]}</strong>
                  <p>{generationMode === "preview-lock" ? "Улучшаем кадры из выбранного preview, не переснимая композицию с нуля." : "Каждый кадр создаётся отдельно. Обычно это занимает до двух минут на ракурс."}</p>
                </div>
                <span className="progress-count">{progressIndex + 1}/{progressSteps.length}</span>
              </div>
            )}

            {error && (
              <div className="error-message" role="alert">
                <WarningCircle size={21} weight="fill" />
                <span>{error}</span>
              </div>
            )}
          </div>
        </div>

        <aside className="hero-visual" aria-label="Пример реалистичной фотографии">
          <img src={heroSofa} alt="Фрагмент светлого дивана в естественном интерьере" />
        </aside>
      </section>

      {result && (
        <section className="results" ref={resultsRef} aria-labelledby="results-title">
          <div className="results-heading">
            <div>
              <p className="eyebrow">
                {status === "generating" ? "Фотосессия создаётся" : "Фотосессия готова"}
              </p>
              <h2 id="results-title">
                {result.scene}. {result.shotSet?.name || "Фотосессия"}: {result.images.length} из {result.expectedCount}.
              </h2>
            </div>
            <div className="cost-receipt" aria-label={result.cost ? `Стоимость API ${result.cost.display}` : "Стоимость рассчитывается"}>
              <span>{status === "generating" ? "Потрачено на готовые кадры" : "Потрачено на API"}</span>
              <strong>{result.cost?.display || "—"}</strong>
              <small>
                {result.modelName || result.model || "gpt-image-2"} · {result.quality || "medium"}
                {result.source === "preview-lock" ? " · preview-lock" : ""}
                {result.cost?.exact === false ? " · estimate" : ""}
                {result.cost ? ` · ${result.cost.tokens.total.toLocaleString("ru-RU")} токенов` : ""}
              </small>
            </div>
          </div>
          <div className="result-grid">
            {Array.from({ length: result.expectedCount }, (_, index) => {
              const image = result.images.find((item) => item.index === index);
              const failedAngle = result.failed?.find((item) => item.index === index);
              const angle = result.angles?.[index];
              if (image) {
                return (
                  <figure className="result-image ready" key={image.id}>
                    <img src={fabricImages[image.id] || image.dataUrl} alt={`${image.label}: сгенерированная фотография дивана`} />
                    <figcaption>
                      <span>
                        {String(index + 1).padStart(2, "0")} · {image.label}
                        {fabricImages[image.id] && <small> · {selectedFabric.name}</small>}
                      </span>
                      <button type="button" onClick={() => downloadImage({ ...image, dataUrl: fabricImages[image.id] || image.dataUrl }, index)}>
                        <DownloadSimple size={18} /> Скачать
                      </button>
                    </figcaption>
                  </figure>
                );
              }
              return (
                <div className={`result-placeholder ${failedAngle ? "failed" : ""}`} key={angle?.id || index}>
                  <span className="placeholder-number">{String(index + 1).padStart(2, "0")}</span>
                  <Sparkle size={24} weight="light" />
                  <strong>{failedAngle ? "Ракурс не создан" : "Создаём ракурс"}</strong>
                  <small>{failedAngle?.label || angle?.label}</small>
                </div>
              );
            })}
          </div>
          {result.warning && <p className="result-warning" role="status">{result.warning}</p>}
          {status !== "generating" && primaryImage && (
            <section className="fabric-workshop" aria-labelledby="fabric-title">
              <header className="fabric-heading">
                <div>
                  <p className="eyebrow">Новая обивка</p>
                  <h3 id="fabric-title">Примерьте другую ткань.</h3>
                </div>
                <div className="fabric-cost">
                  <span>Замена ткани</span>
                  <strong>{fabricCost ? `$${fabricCost.toFixed(4)}` : "$0.06–0.12"}</strong>
                  <small>{fabricJob ? `Batch ≈ $${fabricJob.estimatedCost.toFixed(2)}` : "за главный кадр · medium"}</small>
                </div>
              </header>

              <div className="fabric-layout">
                <div className="fabric-picker" role="radiogroup" aria-label="Ткань для дивана">
                  {fabricPresets.map((fabric) => (
                    <button
                      className={`fabric-option ${fabric.id === fabricId ? "selected" : ""}`}
                      type="button"
                      role="radio"
                      aria-checked={fabric.id === fabricId}
                      disabled={fabricBusy}
                      key={fabric.id}
                      onClick={() => resetFabricSession(fabric.id)}
                    >
                      <img src={fabric.image} alt={`${fabric.name}, ${fabric.tone}`} />
                      <span><strong>{fabric.name}</strong><small>{fabric.tone}</small></span>
                      {fabric.id === fabricId && <Check size={17} weight="bold" aria-hidden="true" />}
                    </button>
                  ))}
                </div>

                <aside className="fabric-action-panel">
                  <div className="fabric-selected">
                    <img src={selectedFabric.image} alt="" />
                    <div>
                      <span>Выбрано</span>
                      <strong>{selectedFabric.name}</strong>
                      <small>{selectedFabric.tone}</small>
                    </div>
                  </div>

                  {!previewReady && (
                    <button
                      className="fabric-primary-button"
                      type="button"
                      disabled={fabricBusy}
                      onClick={() => reupholsterSync([primaryImage], "previewing")}
                    >
                      <span>{fabricStatus === "previewing" ? "Меняем ткань" : "Примерить на главном кадре"}</span>
                      <Swatches size={21} weight="light" />
                    </button>
                  )}

                  {previewReady && remainingImages.length > 0 && !["batch", "applying", "queueing", "complete"].includes(fabricStatus) && (
                    <div className="fabric-followup">
                      <p>Главный кадр готов. Применить ткань к остальным?</p>
                      <button type="button" onClick={() => reupholsterSync(remainingImages, "applying")}>
                        <Lightning size={19} weight="light" />
                        <span><strong>Сразу</strong><small>обычная цена</small></span>
                      </button>
                      <button type="button" onClick={() => reupholsterBatch(remainingImages)}>
                        <ClockCountdown size={19} weight="light" />
                        <span><strong>Экономно</strong><small>−50% · до 24 часов</small></span>
                      </button>
                    </div>
                  )}

                  {fabricStatus === "applying" && <FabricProgress text="Меняем ткань на остальных кадрах" />}
                  {fabricStatus === "queueing" && <FabricProgress text="Ставим кадры в экономную очередь" />}
                  {fabricStatus === "batch" && (
                    <div className="fabric-job" role="status">
                      <ClockCountdown size={23} weight="light" />
                      <div><strong>Экономная обработка запущена</strong><small>Можно оставить страницу открытой — статус обновится автоматически.</small></div>
                    </div>
                  )}
                  {fabricStatus === "complete" && (
                    <div className="fabric-job complete" role="status">
                      <Check size={23} weight="bold" />
                      <div><strong>Ткань применена ко всей серии</strong><small>Все кадры доступны для скачивания.</small></div>
                    </div>
                  )}
                  {fabricError && <p className="fabric-error" role="alert">{fabricError}</p>}
                  {(previewReady || fabricStatus === "error") && !fabricBusy && (
                    <button className="fabric-reset" type="button" onClick={() => resetFabricSession()}>
                      <Rewind size={17} /> Вернуть оригиналы
                    </button>
                  )}
                </aside>
              </div>
            </section>
          )}
          <div className="results-footer">
            <ImagesSquare size={24} weight="light" />
            <p>Обычная генерация не сохраняет фото. Экономные задания и готовые кадры автоматически удаляются в течение 48 часов.</p>
            <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>Создать ещё</button>
          </div>
        </section>
      )}
      {storyboardViewer && (
        <div className="preview-lightbox" role="dialog" aria-modal="true" aria-label={`${storyboardViewer.label}: крупное превью`}>
          <div className="preview-lightbox-bar">
            <strong>{String(storyboardViewer.index + 1).padStart(2, "0")} · {storyboardViewer.label}</strong>
            <div>
              <button type="button" onClick={() => downloadPreviewImage(storyboardViewer)}>
                <DownloadSimple size={18} /> Скачать
              </button>
              <button type="button" aria-label="Закрыть крупное превью" onClick={() => setStoryboardViewer(null)}>
                <X size={20} />
              </button>
            </div>
          </div>
          <button className="preview-lightbox-backdrop" type="button" aria-label="Закрыть крупное превью" onClick={() => setStoryboardViewer(null)} />
          <img src={storyboardViewer.dataUrl} alt={`${storyboardViewer.label}: крупное превью`} />
        </div>
      )}
    </main>
  );
}

function StepHeading({ number, title }) {
  return <h2 className="step-heading"><span>{number}</span>{title}</h2>;
}

function FabricProgress({ text }) {
  return (
    <div className="fabric-job" role="status">
      <Sparkle size={23} weight="light" />
      <div><strong>{text}</strong><small>Готовые кадры появятся по мере обработки.</small></div>
    </div>
  );
}

async function readNdjson(stream, onEvent) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) if (line.trim()) onEvent(JSON.parse(line));
    if (done) break;
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer));
}

async function readJsonResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return response.json();
  const text = await response.text();
  return {
    error: text.trim() || `HTTP ${response.status}`,
  };
}

function formatPreviewError(data) {
  const debug = data?.debug;
  const detail = debug?.message ? ` (${debug.message})` : "";
  return `${data?.error || "Превью раскадровки не создано."}${detail}`;
}

function storyboardProgressText(elapsed, modelLabel) {
  if (elapsed < 8) return "Отправляем референсы и комнату";
  if (elapsed < 45) return `${modelLabel} собирает contact sheet`;
  if (elapsed < 120) return "Ждём изображение, запрос ещё активен";
  return "Запрос долгий: ждём ответ или ошибку модели";
}

function formatElapsed(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function downloadDataUrl(dataUrl, filename) {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  anchor.click();
}

async function cropContactSheet(dataUrl, grid, cells) {
  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Браузер не смог нарезать превью.");
  const cellWidth = Math.floor(image.naturalWidth / grid.columns);
  const cellHeight = Math.floor(image.naturalHeight / grid.rows);
  canvas.width = cellWidth;
  canvas.height = cellHeight;

  return cells.map((cell) => {
    const column = cell.index % grid.columns;
    const row = Math.floor(cell.index / grid.columns);
    context.clearRect(0, 0, cellWidth, cellHeight);
    context.drawImage(
      image,
      column * cellWidth,
      row * cellHeight,
      cellWidth,
      cellHeight,
      0,
      0,
      cellWidth,
      cellHeight,
    );
    return {
      ...cell,
      dataUrl: canvas.toDataURL("image/jpeg", 0.9),
    };
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Не удалось открыть contact sheet."));
    image.src = src;
  });
}
