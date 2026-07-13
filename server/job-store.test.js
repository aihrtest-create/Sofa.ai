import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { JobStore } from "./job-store.js";

test("job store removes expired temporary image jobs", async (context) => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "sofa-shot-jobs-"));
  context.after(() => fs.promises.rm(root, { recursive: true, force: true }));
  const runtime = path.join(root, ".runtime");
  await fs.promises.mkdir(runtime);
  await fs.promises.writeFile(path.join(runtime, "reupholster-jobs.json"), JSON.stringify({
    jobs: [
      { id: "expired", createdAt: "2020-01-01T00:00:00.000Z", expiresAt: "2020-01-03T00:00:00.000Z" },
      { id: "active", createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString() },
    ],
  }));

  const store = await new JobStore(root).load();
  assert.equal(store.get("expired"), null);
  assert.equal(store.get("active").id, "active");
});
