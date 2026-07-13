import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowCounterClockwise,
  ArrowLeft,
  ArrowRight,
  ArrowsOut,
  Camera,
  Check,
  ClockCounterClockwise,
  Coins,
  DownloadSimple,
  MagicWand,
  Plus,
  Sparkle,
  Trash,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import heroSofa from "./assets/hero-sofa.png";
import studioScene from "./assets/scene-studio.png";
import lightScene from "./assets/scene-light.png";
import warmScene from "./assets/scene-warm.png";
import ugcApartmentScene from "./assets/background-presets/ugc-apartment-window-main-iphone-clean.jpg";
import ugcHerringboneScene from "./assets/background-presets/ugc-herringbone-living-main-iphone-clean.jpg";
import cameraHero from "./assets/camera-previews/tile-00-hero-schematic.jpg";
import cameraFront from "./assets/camera-previews/tile-01-front-schematic.jpg";
import cameraDepth from "./assets/camera-previews/tile-02-depth-schematic.jpg";
import cameraDetail from "./assets/camera-previews/tile-03-detail-schematic.jpg";
import cameraElevated from "./assets/camera-previews/tile-04-elevated-schematic.jpg";
import cameraRoom from "./assets/camera-previews/tile-05-room-schematic.jpg";
import { apiUrl } from "./api.js";
import { DEFAULT_GENERATION_MODEL_ID, GENERATION_MODELS } from "../shared/generationModels.js";
import { DEFAULT_IMAGE_FORMAT_ID, IMAGE_FORMATS, findImageFormat } from "../shared/imageFormats.js";
import {
  clearSingleShotGenerations,
  deleteSingleShotGeneration,
  listSingleShotGenerations,
  saveSingleShotGeneration,
  summarizeSingleShotHistory,
} from "./singleShotHistory.js";

const MAX_FILES = 6;
const MAX_FILE_SIZE = 18 * 1024 * 1024;
const MAX_TOTAL_SIZE = 50 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const GENERATION_PHRASES = [
  "Выставляем ракурс",
  "Ставим мягкий свет",
  "Сверяем форму дивана",
  "Проверяем ножки и швы",
  "Оставляем воздух в кадре",
  "Настраиваем объектив",
  "Ждём фотографа",
  "Проявляем фактуру ткани",
];

const scenes = [
  { id: "auto", name: "Подобрать фон", image: heroSofa, auto: true },
  { id: "studio", name: "Студия", image: studioScene },
  { id: "light", name: "Светлый", image: lightScene },
  { id: "warm", name: "Тёплый", image: warmScene },
  { id: "ugcApartmentWindow", name: "UGC квартира", image: ugcApartmentScene },
  { id: "ugcHerringboneLiving", name: "UGC гостиная", image: ugcHerringboneScene },
];

const cameras = [
  { id: "hero", label: "Hero", note: "Главный 3/4 ракурс", image: cameraHero },
  { id: "front", label: "Front", note: "Строго спереди", image: cameraFront },
  { id: "depth", label: "Depth", note: "Глубина и профиль", image: cameraDepth },
  { id: "detail", label: "Detail", note: "Ткань и швы", image: cameraDetail },
  { id: "elevated", label: "Elevated", note: "Слегка сверху", image: cameraElevated },
  { id: "room", label: "Room", note: "Широкий интерьер", image: cameraRoom },
];

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const demoMode = import.meta.env.DEV && new URLSearchParams(window.location.search).get("demo") === "result";

export function SingleShotApp() {
  const [files, setFiles] = useState([]);
  const [primaryIndex, setPrimaryIndex] = useState(0);
  const [sceneId, setSceneId] = useState("ugcHerringboneLiving");
  const [cameraId, setCameraId] = useState("hero");
  const [modelId, setModelId] = useState(DEFAULT_GENERATION_MODEL_ID);
  const [formatId, setFormatId] = useState(DEFAULT_IMAGE_FORMAT_ID);
  const [status, setStatus] = useState(demoMode ? "done" : "idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [history, setHistory] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [revisionNote, setRevisionNote] = useState("");
  const [generationPhraseIndex, setGenerationPhraseIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [mobileStep, setMobileStep] = useState(demoMode ? 3 : 1);
  const [result, setResult] = useState(demoMode ? {
    dataUrl: heroSofa,
    camera: { id: "hero", label: "Hero" },
    scene: "UGC гостиная",
    sceneId: "ugcHerringboneLiving",
    modelId: DEFAULT_GENERATION_MODEL_ID,
    modelName: "GPT Image 2",
    format: { id: "landscape", label: "Горизонтальная", ratio: "16:9" },
    cost: { usd: 0.0719, display: "$0.0719" },
  } : null);
  const inputRef = useRef(null);
  const restoredResultUrl = useRef(null);

  const previews = useMemo(
    () => files.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [files],
  );
  useEffect(() => () => previews.forEach(({ url }) => URL.revokeObjectURL(url)), [previews]);

  const historyPreviews = useMemo(
    () => history.map((item) => ({ item, url: URL.createObjectURL(item.resultBlob) })),
    [history],
  );
  useEffect(
    () => () => historyPreviews.forEach(({ url }) => URL.revokeObjectURL(url)),
    [historyPreviews],
  );

  useEffect(() => {
    listSingleShotGenerations()
      .then(setHistory)
      .catch((historyLoadError) => setHistoryError(historyLoadError.message));
  }, []);

  useEffect(() => {
    if (status !== "generating") return undefined;
    setElapsed(0);
    setGenerationPhraseIndex(0);
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1_000);
    const phraseTimer = window.setInterval(
      () => setGenerationPhraseIndex((value) => (value + 1) % GENERATION_PHRASES.length),
      2_700,
    );
    return () => {
      window.clearInterval(timer);
      window.clearInterval(phraseTimer);
    };
  }, [status]);

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key !== "Escape") return;
      setDialog(null);
      setHistoryOpen(false);
      setLightboxOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  useEffect(() => () => {
    if (restoredResultUrl.current) URL.revokeObjectURL(restoredResultUrl.current);
  }, []);

  const selectedScene = scenes.find((item) => item.id === sceneId) ?? scenes[0];
  const selectedCamera = cameras.find((item) => item.id === cameraId) ?? cameras[0];
  const selectedModel = GENERATION_MODELS.find((item) => item.id === modelId) ?? GENERATION_MODELS[0];
  const selectedFormat = findImageFormat(formatId) ?? IMAGE_FORMATS[0];
  const historySummary = useMemo(() => summarizeSingleShotHistory(history), [history]);

  function clearRestoredResultUrl() {
    if (!restoredResultUrl.current) return;
    URL.revokeObjectURL(restoredResultUrl.current);
    restoredResultUrl.current = null;
  }

  function resetResult() {
    clearRestoredResultUrl();
    setResult(null);
    setStatus("idle");
  }

  function addFiles(fileList) {
    if (status === "generating") return;
    setError("");
    const incoming = Array.from(fileList);
    if (incoming.some((file) => !ALLOWED_TYPES.has(file.type))) return setError("Поддерживаются JPG, PNG и WebP.");
    if (incoming.some((file) => file.size > MAX_FILE_SIZE)) return setError("Каждый файл должен быть не больше 18 МБ.");
    if (files.length + incoming.length > MAX_FILES) return setError("Можно загрузить не больше 6 фотографий.");
    const next = [...files, ...incoming];
    if (next.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL_SIZE) return setError("Общий размер референсов должен быть не больше 50 МБ.");
    setFiles(next);
    resetResult();
  }

  function removeFile(index) {
    if (status === "generating") return;
    setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setPrimaryIndex((current) => {
      if (index === current) return 0;
      return index < current ? current - 1 : current;
    });
    resetResult();
  }

  function selectScene(nextSceneId) {
    if (status === "generating") return;
    setSceneId(nextSceneId);
    resetResult();
  }

  function selectCamera(nextCameraId) {
    if (status === "generating") return;
    setCameraId(nextCameraId);
    resetResult();
  }

  function selectModel(nextModelId) {
    if (status === "generating") return;
    setModelId(nextModelId);
    resetResult();
  }

  function selectFormat(nextFormatId) {
    if (status === "generating") return;
    setFormatId(nextFormatId);
    resetResult();
  }

  async function refreshHistory() {
    setHistory(await listSingleShotGenerations());
  }

  async function persistGeneration(data, note, snapshot) {
    try {
      const resultBlob = await fetch(data.dataUrl).then((response) => response.blob());
      const record = {
        id: globalThis.crypto?.randomUUID?.() ?? `generation-${Date.now()}`,
        createdAt: new Date().toISOString(),
        resultBlob,
        references: snapshot.files.map((file) => ({
          blob: file,
          name: file.name,
          type: file.type,
          lastModified: file.lastModified,
        })),
        primaryIndex: snapshot.primaryIndex,
        sceneId: snapshot.sceneId,
        scene: data.scene,
        cameraId: snapshot.cameraId,
        cameraLabel: data.camera?.label ?? selectedCamera.label,
        modelId: snapshot.modelId,
        modelName: data.modelName ?? selectedModel.label,
        formatId: snapshot.formatId,
        format: data.format ?? selectedFormat,
        revisionNote: note,
        cost: data.cost,
      };
      await saveSingleShotGeneration(record);
      await refreshHistory();
      setHistoryError("");
    } catch (storageError) {
      setHistoryError(`Кадр создан, но не сохранён в историю: ${storageError.message}`);
    }
  }

  async function generateFrame(note = "") {
    if (!files.length || status === "generating") return;
    clearRestoredResultUrl();
    setStatus("generating");
    setError("");
    setResult(null);
    setDialog(null);
    setMobileStep(3);

    const orderedFiles = [files[primaryIndex], ...files.filter((_, index) => index !== primaryIndex)];
    const snapshot = {
      files: [...files],
      primaryIndex,
      sceneId,
      cameraId,
      modelId,
      formatId,
    };
    const body = new FormData();
    orderedFiles.forEach((file) => body.append("images", file));
    body.append("scene", sceneId);
    body.append("camera", cameraId);
    body.append("model", modelId);
    body.append("format", formatId);
    if (note) body.append("revisionNote", note);

    try {
      const response = await fetch(apiUrl("/api/generate-frame"), { method: "POST", body });
      const data = await parseGenerationResponse(response);
      if (!response.ok) throw new Error(data.error || "Модель не завершила выбранный кадр.");
      setResult(data);
      setStatus("done");
      setRevisionNote("");
      await persistGeneration(data, note, snapshot);
    } catch (generationError) {
      setError(generationError.message);
      setStatus("error");
    }
  }

  function openRegenerationDialog() {
    if (!files.length || status === "generating") return;
    setRevisionNote("");
    setDialog("regenerate");
  }

  function downloadUrl(url, filename) {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
  }

  function downloadResult() {
    if (!result?.dataUrl) return;
    downloadUrl(result.dataUrl, `sofa-${result.camera?.id || cameraId}-${result.format?.id || formatId}-${result.modelId || modelId}.jpg`);
  }

  function downloadHistoryItem(item) {
    const url = URL.createObjectURL(item.resultBlob);
    downloadUrl(url, `sofa-${item.cameraId}-${item.formatId || DEFAULT_IMAGE_FORMAT_ID}-${item.modelId}.jpg`);
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  function restoreHistoryItem(item) {
    clearRestoredResultUrl();
    const restoredFiles = item.references.map((reference, index) => new File(
      [reference.blob],
      reference.name || `sofa-reference-${index + 1}.jpg`,
      { type: reference.type || reference.blob.type, lastModified: reference.lastModified || Date.now() },
    ));
    const url = URL.createObjectURL(item.resultBlob);
    restoredResultUrl.current = url;
    setFiles(restoredFiles);
    setPrimaryIndex(Math.min(item.primaryIndex ?? 0, Math.max(restoredFiles.length - 1, 0)));
    setSceneId(item.sceneId);
    setCameraId(item.cameraId);
    setModelId(item.modelId);
    setFormatId(item.formatId || DEFAULT_IMAGE_FORMAT_ID);
    setResult({
      dataUrl: url,
      camera: { id: item.cameraId, label: item.cameraLabel },
      scene: item.scene,
      sceneId: item.sceneId,
      modelId: item.modelId,
      modelName: item.modelName,
      format: item.format ?? IMAGE_FORMATS[0],
      cost: item.cost,
    });
    setStatus("done");
    setError("");
    setHistoryOpen(false);
    setMobileStep(3);
  }

  async function removeHistoryItem(id) {
    try {
      await deleteSingleShotGeneration(id);
      await refreshHistory();
    } catch (storageError) {
      setHistoryError(storageError.message);
    }
  }

  async function clearHistory() {
    try {
      await clearSingleShotGenerations();
      setHistory([]);
      setHistoryError("");
      setDialog(null);
      setHistoryOpen(false);
    } catch (storageError) {
      setHistoryError(storageError.message);
    }
  }

  return (
    <main className="single-shot-shell" data-mobile-step={mobileStep}>
      <section className="single-shot-controls" aria-label="Генерация одного кадра">
        <header className="single-shot-header">
          <div>
            <p className="single-shot-brand">Sofa.ai</p>
            <p className="single-shot-caption">AI-фотостудия для производителей мебели</p>
          </div>
          <button
            className="history-trigger"
            type="button"
            aria-label={`История генераций: ${history.length}`}
            onClick={() => setHistoryOpen(true)}
          >
            <ClockCounterClockwise size={20} />
            <span>История</span>
            <strong>{history.length}</strong>
          </button>
        </header>

        <nav className="single-mobile-steps" aria-label="Шаги фотостудии">
          {["Фото", "Съёмка", "Результат"].map((label, index) => {
            const step = index + 1;
            const disabled = status === "generating"
              ? step !== 3
              : step === 2
                ? !files.length
                : step === 3
                  ? !result
                  : false;
            return (
              <button
                type="button"
                className={mobileStep === step ? "active" : ""}
                disabled={disabled}
                onClick={() => setMobileStep(step)}
                key={label}
              >
                <span>{step}</span>{label}
              </button>
            );
          })}
        </nav>

        <div className="single-shot-form">
          <div className="single-mobile-pane single-mobile-pane-1">
            <section className="single-control-section">
              <SingleHeading number="1" title="Референсы товара" note="Нажмите на фото, чтобы сделать его главным." />
              <div className="single-upload-row">
                {previews.map((preview, index) => (
                  <div className={`single-upload-thumb ${primaryIndex === index ? "primary" : ""}`} key={`${preview.file.name}-${index}`}>
                    <button type="button" className="single-upload-select" disabled={status === "generating"} onClick={() => setPrimaryIndex(index)}>
                      <img src={preview.url} alt={`Референс ${index + 1}`} />
                      {primaryIndex === index && <span><Check size={11} weight="bold" /> Главное</span>}
                    </button>
                    <button type="button" className="single-upload-remove" disabled={status === "generating"} aria-label={`Удалить фото ${index + 1}`} onClick={() => removeFile(index)}>
                      <X size={12} weight="bold" />
                    </button>
                  </div>
                ))}
                {files.length < MAX_FILES && (
                  <button type="button" className="single-upload-add" disabled={status === "generating"} onClick={() => inputRef.current?.click()}>
                    {files.length ? <Plus size={22} /> : <Camera size={23} />}
                    <span>{files.length ? "Добавить" : "Загрузить фото"}</span>
                  </button>
                )}
              </div>
              <input
                ref={inputRef}
                className="visually-hidden"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                disabled={status === "generating"}
                onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }}
              />
              {error && mobileStep === 1 && <p className="single-error" role="alert">{error}</p>}
              <button className="single-mobile-next" type="button" disabled={!files.length} onClick={() => setMobileStep(2)}>
                Настроить съёмку <ArrowRight size={19} />
              </button>
            </section>
          </div>

          <div className="single-mobile-pane single-mobile-pane-2">
            <section className="single-control-section">
              <SingleHeading number="2" title="Фон" note="Превью помогает выбрать сцену, в генерацию передаётся только текст." />
              <div className="single-scene-strip" role="radiogroup" aria-label="Фон">
                {scenes.map((scene) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={sceneId === scene.id}
                    className={sceneId === scene.id ? "selected" : ""}
                    disabled={status === "generating"}
                    key={scene.id}
                    onClick={() => selectScene(scene.id)}
                  >
                    <span className="single-scene-image">
                      <img src={scene.image} alt="" />
                      {scene.auto && <MagicWand size={20} weight="fill" />}
                    </span>
                    <span className="single-scene-name">{scene.name}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="single-control-section">
              <SingleHeading number="3" title="Ракурс" note="Один диван показывает разницу между кадрами." />
              <div className="camera-picker" role="radiogroup" aria-label="Ракурс">
                {cameras.map((camera, index) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={cameraId === camera.id}
                    className={cameraId === camera.id ? "selected" : ""}
                    disabled={status === "generating"}
                    key={camera.id}
                    onClick={() => selectCamera(camera.id)}
                  >
                    <img src={camera.image} alt="" />
                    <span className="camera-copy">
                      <small>{String(index + 1).padStart(2, "0")}</small>
                      <strong>{camera.label}</strong>
                      <span>{camera.note}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className="single-control-section">
              <SingleHeading number="4" title="Формат" />
              <div className="single-format-picker" role="radiogroup" aria-label="Формат фотографии">
                {IMAGE_FORMATS.map((format) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={formatId === format.id}
                    className={formatId === format.id ? "selected" : ""}
                    disabled={status === "generating"}
                    key={format.id}
                    onClick={() => selectFormat(format.id)}
                  >
                    <span className={`single-format-shape ${format.id}`} aria-hidden="true" />
                    <span><strong>{format.label}</strong><small>{format.ratio}</small></span>
                  </button>
                ))}
              </div>
            </section>

            <section className="single-control-section single-model-section">
              <SingleHeading number="5" title="Модель" />
              <div className="single-model-picker" role="radiogroup" aria-label="Модель генерации">
                {GENERATION_MODELS.map((model) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={modelId === model.id}
                    className={modelId === model.id ? "selected" : ""}
                    disabled={status === "generating"}
                    key={model.id}
                    onClick={() => selectModel(model.id)}
                  >
                    <span>{model.badge}</span>
                    <strong>{model.shortLabel}</strong>
                    <small>{model.quality}</small>
                  </button>
                ))}
              </div>
              <p className="single-model-note">{selectedModel.description}</p>
            </section>

            {(error || historyError) && <p className="single-error" role="alert">{error || historyError}</p>}
            <div className="single-mobile-back-row">
              <button type="button" onClick={() => setMobileStep(1)}><ArrowLeft size={17} /> Фото</button>
            </div>
            <button
              className="single-generate-button"
              type="button"
              disabled={!files.length || status === "generating"}
              onClick={() => result ? openRegenerationDialog() : generateFrame()}
            >
              <span>{status === "generating" ? `Создаём ${selectedCamera.label} · ${formatElapsed(elapsed)}` : result ? "Перегенерировать" : "Создать один кадр"}</span>
              {status === "generating" ? <Sparkle size={22} /> : result ? <ArrowCounterClockwise size={22} /> : <ArrowRight size={22} />}
            </button>
          </div>
        </div>
      </section>

      <aside className={`single-shot-stage ${result ? "has-result" : ""}`} aria-live="polite">
        {result ? (
          <>
            <button
              className="single-result-preview"
              type="button"
              style={{ "--result-ratio": findImageFormat(result.format?.id)?.cssRatio || selectedFormat.cssRatio }}
              onClick={() => setLightboxOpen(true)}
              aria-label="Открыть фотографию на весь экран"
            >
              <img className="single-result-image" src={result.dataUrl} alt={`${result.camera?.label || selectedCamera.label}: результат`} />
              <span><ArrowsOut size={18} /> На весь экран</span>
            </button>
            <div className="single-result-topline">
              <span>Один кадр</span>
              <strong>{result.camera?.label || selectedCamera.label}</strong>
            </div>
            <div className="single-result-bar">
              <div>
                <small>{result.scene} · {result.format?.label || selectedFormat.label} {result.format?.ratio || selectedFormat.ratio} · {result.modelName || selectedModel.shortLabel}</small>
                <strong>{result.cost?.display || "Стоимость недоступна"}</strong>
              </div>
              <div className="single-result-actions">
                <button type="button" onClick={openRegenerationDialog} title="Уточнить и перегенерировать">
                  <ArrowCounterClockwise size={18} /><span>Уточнить</span>
                </button>
                <button type="button" onClick={downloadResult} title="Скачать кадр">
                  <DownloadSimple size={18} /><span>Скачать</span>
                </button>
              </div>
            </div>
          </>
        ) : status === "generating" ? (
          <div className="single-stage-progress">
            <span className="single-progress-orbit"><Sparkle size={34} weight="thin" /></span>
            <p>Генерируется выбранный кадр</p>
            <strong key={generationPhraseIndex} className="single-progress-phrase">{GENERATION_PHRASES[generationPhraseIndex]}</strong>
            <small>{selectedCamera.label} · {selectedFormat.ratio} · {selectedModel.shortLabel} · {formatElapsed(elapsed)}</small>
          </div>
        ) : status === "error" ? (
          <div className="single-stage-error" role="alert">
            <span><WarningCircle size={28} weight="fill" /></span>
            <p>Генерация не завершилась</p>
            <strong>{error || "Не удалось получить ответ от модели."}</strong>
            <small>{selectedCamera.label} · {selectedFormat.ratio} · {selectedModel.shortLabel}</small>
            <button type="button" onClick={() => setMobileStep(2)}>Вернуться к настройкам <ArrowLeft size={17} /></button>
          </div>
        ) : (
          <div className="single-stage-empty">
            <img src={selectedScene.image} alt="" />
            <div className="single-stage-copy">
              <span>Выбранный кадр</span>
              <h2>{selectedCamera.label}</h2>
              <p>{selectedCamera.note}. Фон задаётся текстом, а загруженные фотографии остаются единственным источником дивана.</p>
            </div>
          </div>
        )}
      </aside>

      <div className={`single-history-layer ${historyOpen ? "open" : ""}`} aria-hidden={!historyOpen}>
        <button className="single-history-scrim" type="button" aria-label="Закрыть историю" onClick={() => setHistoryOpen(false)} />
        <aside className="single-history-drawer" aria-label="История генераций">
          <header>
            <div><span>Локально на устройстве</span><h2>История</h2></div>
            <button type="button" aria-label="Закрыть историю" onClick={() => setHistoryOpen(false)}><X size={22} /></button>
          </header>

          <section className="single-history-summary">
            <div><Coins size={22} /><span>Потрачено</span><strong>${historySummary.usd.toFixed(4)}</strong></div>
            <div><ClockCounterClockwise size={22} /><span>Генераций</span><strong>{historySummary.count}</strong></div>
          </section>

          <div className="single-model-totals">
            {Object.values(historySummary.byModel).map((model) => (
              <div key={model.id}><span>{model.name}</span><strong>{model.count} · ${model.usd.toFixed(4)}</strong></div>
            ))}
          </div>

          {historyError && <p className="single-error" role="alert">{historyError}</p>}
          <div className="single-history-list">
            {historyPreviews.length ? historyPreviews.map(({ item, url }) => (
              <article className="single-history-item" key={item.id}>
                <button className="single-history-open" type="button" onClick={() => restoreHistoryItem(item)}>
                  <img src={url} alt={`${item.cameraLabel}, ${item.scene}`} />
                  <span>
                    <small>{dateFormatter.format(new Date(item.createdAt))}</small>
                    <strong>{item.cameraLabel} · {item.scene}</strong>
                    <em>{item.format?.label || "Горизонтальная"} {item.format?.ratio || "16:9"} · {item.modelName} · {item.cost?.display || "$0.0000"}</em>
                  </span>
                </button>
                <div>
                  <button type="button" aria-label="Скачать кадр из истории" onClick={() => downloadHistoryItem(item)}><DownloadSimple size={17} /></button>
                  <button type="button" aria-label="Удалить кадр из истории" onClick={() => removeHistoryItem(item.id)}><Trash size={17} /></button>
                </div>
              </article>
            )) : (
              <div className="single-history-empty"><ClockCounterClockwise size={28} /><p>Здесь появятся созданные кадры.</p></div>
            )}
          </div>

          {history.length > 0 && (
            <button className="single-clear-history" type="button" onClick={() => setDialog("clear")}>
              <Trash size={17} /> Очистить память
            </button>
          )}
        </aside>
      </div>

      {dialog === "regenerate" && (
        <div className="single-dialog-layer" role="presentation">
          <section className="single-dialog" role="dialog" aria-modal="true" aria-labelledby="regenerate-title">
            <button className="single-dialog-close" type="button" aria-label="Закрыть" onClick={() => setDialog(null)}><X size={20} /></button>
            <span>Уточнение кадра</span>
            <h2 id="regenerate-title">Что нужно исправить?</h2>
            <p>Новый кадр будет создан заново из исходных фотографий дивана.</p>
            <textarea
              value={revisionNote}
              maxLength={1_000}
              autoFocus
              placeholder="Например: сохранить полную ширину дивана, показать все металлические ножки и сделать фон светлее."
              onChange={(event) => setRevisionNote(event.target.value)}
            />
            <small>{revisionNote.length} / 1000</small>
            <button className="single-dialog-primary" type="button" onClick={() => generateFrame(revisionNote.trim())}>
              Перегенерировать <ArrowCounterClockwise size={19} />
            </button>
          </section>
        </div>
      )}

      {dialog === "clear" && (
        <div className="single-dialog-layer" role="presentation">
          <section className="single-dialog single-clear-dialog" role="dialog" aria-modal="true" aria-labelledby="clear-title">
            <span>Локальная память</span>
            <h2 id="clear-title">Удалить всю историю?</h2>
            <p>Сохранённые результаты и исходные фотографии будут удалены из этого браузера.</p>
            <div>
              <button type="button" onClick={() => setDialog(null)}>Отмена</button>
              <button type="button" onClick={clearHistory}>Удалить всё</button>
            </div>
          </section>
        </div>
      )}

      {lightboxOpen && result?.dataUrl && (
        <div className="single-lightbox" role="dialog" aria-modal="true" aria-label="Полноэкранный просмотр фотографии">
          <button type="button" className="single-lightbox-close" aria-label="Закрыть полноэкранный просмотр" onClick={() => setLightboxOpen(false)}><X size={24} /></button>
          <img src={result.dataUrl} alt={`${result.camera?.label || selectedCamera.label}: полноэкранный результат`} />
          <div>
            <span>{result.camera?.label || selectedCamera.label} · {result.format?.label || selectedFormat.label} {result.format?.ratio || selectedFormat.ratio}</span>
            <button type="button" onClick={downloadResult}><DownloadSimple size={19} /> Скачать</button>
          </div>
        </div>
      )}
    </main>
  );
}

function SingleHeading({ number, title, note }) {
  return (
    <div className="single-heading">
      <span>{number}</span>
      <div><strong>{title}</strong>{note && <small>{note}</small>}</div>
    </div>
  );
}

function formatElapsed(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

async function parseGenerationResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return response.json();
  const text = await response.text();
  return { error: text.trim() || `Сервер вернул ошибку HTTP ${response.status}.` };
}
