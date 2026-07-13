import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { createQaExport, buildQaManifest, parseDataUrl } from "./qa-export.js";

test("qa export writes prompt metadata and visual artifacts without API", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sofa-qa-"));
  const result = await createQaExport({
    root,
    source: "codex-simulation",
    sceneId: "ugcHerringboneLiving",
    shotSetId: "quick",
    notes: "No API call.",
    prompts: {
      "contact-sheet": "contact prompt",
      "finalize-01-hero": "finalize prompt",
    },
    artifacts: [
      {
        name: "simulation-01",
        label: "Hero simulation",
        role: "codex-simulation",
        dataUrl: `data:image/jpeg;base64,${Buffer.from("fake-jpeg").toString("base64")}`,
      },
    ],
  });

  const manifest = JSON.parse(await fs.readFile(result.manifestPath, "utf8"));
  assert.equal(manifest.source, "codex-simulation");
  assert.equal(manifest.shotSet.id, "quick");
  assert.equal(manifest.prompts.length, 2);
  assert.equal(manifest.artifacts.length, 1);
  assert.match(await fs.readFile(result.reviewPath, "utf8"), /Leg count, shape, material/i);
  assert.equal(await fs.readFile(path.join(result.folder, "prompts", "contact-sheet.txt"), "utf8"), "contact prompt");
  assert.equal(await fs.readFile(path.join(result.folder, "images", "simulation-01.jpg"), "utf8"), "fake-jpeg");
});

test("qa manifest validates source and data URL artifacts", () => {
  assert.throws(
    () => buildQaManifest({ source: "unknown", sceneId: "studio", shotSetId: "quick" }),
    /Unsupported QA source/i,
  );
  assert.equal(parseDataUrl("data:image/png;base64,ZmFrZQ==").extension, "png");
  assert.throws(() => parseDataUrl("not-a-data-url"), /Invalid data URL/i);
});
