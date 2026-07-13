const DB_NAME = "sofa-ai-single-shot";
const DB_VERSION = 1;
const STORE_NAME = "generations";

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Не удалось открыть локальную историю."));
  });
}

function openDatabase() {
  if (!globalThis.indexedDB) {
    return Promise.reject(new Error("Локальная история недоступна в этом браузере."));
  }

  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Не удалось открыть локальную историю."));
    request.onblocked = () => reject(new Error("Закройте другие вкладки Sofa.ai и повторите."));
  });
}

async function runTransaction(mode, operation) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const result = await operation(store);
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error ?? new Error("Ошибка локального хранилища."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Операция с историей отменена."));
    });
    return result;
  } finally {
    database.close();
  }
}

export async function listSingleShotGenerations() {
  const items = await runTransaction("readonly", (store) => requestResult(store.getAll()));
  return items.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
}

export function saveSingleShotGeneration(record) {
  return runTransaction("readwrite", (store) => requestResult(store.put(record)));
}

export function deleteSingleShotGeneration(id) {
  return runTransaction("readwrite", (store) => requestResult(store.delete(id)));
}

export function clearSingleShotGenerations() {
  return runTransaction("readwrite", (store) => requestResult(store.clear()));
}

export function summarizeSingleShotHistory(items) {
  return items.reduce(
    (summary, item) => {
      const usd = Number(item.cost?.usd ?? 0);
      const modelId = item.modelId || "unknown";
      const model = summary.byModel[modelId] ?? {
        id: modelId,
        name: item.modelName || item.model || "Неизвестная модель",
        count: 0,
        usd: 0,
      };
      model.count += 1;
      model.usd += Number.isFinite(usd) ? usd : 0;
      summary.count += 1;
      summary.usd += Number.isFinite(usd) ? usd : 0;
      summary.byModel[modelId] = model;
      return summary;
    },
    { count: 0, usd: 0, byModel: {} },
  );
}
