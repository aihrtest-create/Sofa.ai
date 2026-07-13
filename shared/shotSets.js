export const CAMERA_IDS = Object.freeze(["hero", "front", "depth", "detail", "elevated", "room"]);

export const SHOT_SETS = Object.freeze([
  {
    id: "quick",
    name: "Быстрый сет",
    countLabel: "4 кадра",
    count: 4,
    cameraIds: ["hero", "front", "depth", "detail"],
    summary: "Hero · Front · Depth · Detail",
    description: "4 кадра для карточки товара",
    grid: { columns: 2, rows: 2 },
  },
  {
    id: "full",
    name: "Полная съёмка",
    countLabel: "6 кадров",
    count: 6,
    cameraIds: ["hero", "front", "depth", "detail", "elevated", "room"],
    summary: "Hero · Front · Depth · Detail · Elevated · Room",
    description: "6 кадров для мини-фотосессии",
    grid: { columns: 3, rows: 2 },
  },
]);

export function getShotSet(id) {
  return findShotSet(id) ?? SHOT_SETS[0];
}

export function findShotSet(id) {
  return SHOT_SETS.find((shotSet) => shotSet.id === id) ?? null;
}
