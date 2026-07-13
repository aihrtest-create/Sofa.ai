import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import {
  QA_SOFA_ARCHETYPES,
  buildRunMatrix,
  buildSimulationContactSheetPrompt,
  createSimulationBatch,
} from "../scripts/qa-simulate-full.mjs";

test("simulation batch creates six full-set QA runs without product API", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sofa-simulation-"));
  const result = await createSimulationBatch({
    rootDir: root,
    createdAt: new Date("2026-06-29T10:00:00.000Z"),
  });

  assert.equal(result.contactSheetCount, 6);
  assert.equal(result.frameCount, 36);

  const manifest = JSON.parse(await fs.readFile(result.manifestPath, "utf8"));
  assert.equal(manifest.source, "codex-simulation");
  assert.equal(manifest.matrix.contactSheets, 6);
  assert.equal(manifest.matrix.frames, 36);
  assert.deepEqual(manifest.shotSet.grid, { columns: 3, rows: 2 });

  const summary = await fs.readFile(result.summaryPath, "utf8");
  assert.match(summary, /Problems Table/i);
  assert.match(summary, /Top 5 Recurring Problems/i);
  assert.match(summary, /minimal real API smoke test/i);

  const firstRun = manifest.runs[0];
  const runManifestPath = path.join(result.folder, firstRun.manifest);
  const runManifest = JSON.parse(await fs.readFile(runManifestPath, "utf8"));
  assert.equal(runManifest.scoring.length, 6);
  assert.equal(runManifest.artifacts.length, 7);
  assert.equal(runManifest.scoring[0].frame, "01-hero");
  assert.equal(runManifest.scoring[5].frame, "06-room");
  await fs.access(path.join(path.dirname(runManifestPath), "images", "contact-sheet.svg"));
  await fs.access(path.join(path.dirname(runManifestPath), "images", "01-hero.svg"));
});

test("simulation prompt preserves controlled archetype and canonical contact-sheet prompt", () => {
  const run = buildRunMatrix()[0];
  const prompt = buildSimulationContactSheetPrompt(run);

  assert.equal(QA_SOFA_ARCHETYPES.length, 3);
  assert.match(prompt, /CONTROLLED PRODUCT REFERENCE/i);
  assert.match(prompt, /sole product source of truth/i);
  assert.match(prompt, /exact 3 columns by 2 rows/i);
  assert.match(prompt, /Leg and footprint/i);
});

test("simulation batch aggregates scored issues into the summary", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sofa-simulation-issues-"));
  const result = await createSimulationBatch({
    rootDir: root,
    createdAt: new Date("2026-06-29T11:00:00.000Z"),
    issueRows: [
      {
        collage: "01-ugcHerringboneLiving-straight-visible-legs",
        frame: "01-hero",
        severity: "P1 major",
        category: "Scale",
        issue: "Sofa is too large for the rug",
        likelyFixArea: "room scene prompt",
        notes: "Scale drift is obvious.",
      },
      {
        collage: "04-ugcApartmentWindow-straight-visible-legs",
        frame: "01-hero",
        severity: "P1 major",
        category: "Scale",
        issue: "Sofa is too large for the rug",
        likelyFixArea: "room scene prompt",
      },
    ],
  });

  const summary = await fs.readFile(result.summaryPath, "utf8");
  assert.match(summary, /Top 5 Recurring Problems/i);
  assert.match(summary, /Sofa is too large for the rug/i);
  assert.match(summary, /\\| Scale \\| Sofa is too large for the rug \\| 2 \\| room scene prompt/i);
});
