import test from "node:test";
import assert from "node:assert/strict";
import { FABRICS } from "../shared/fabrics.js";
import {
  BATCH_ESTIMATE_PER_IMAGE_USD,
  buildReupholsterPrompt,
  validateReupholsterInput,
} from "./reupholster.js";

test("ships six distinct upholstery presets", () => {
  assert.equal(FABRICS.length, 6);
  assert.equal(new Set(FABRICS.map((fabric) => fabric.id)).size, 6);
  assert.ok(FABRICS.every((fabric) => fabric.file.endsWith(".jpg")));
});

test("reupholster prompt separates geometry lock from material transfer", () => {
  const prompt = buildReupholsterPrompt(FABRICS[0]);
  assert.match(prompt, /GEOMETRY AND SCENE LOCK/i);
  assert.match(prompt, /replace only the sofa's existing upholstered textile/i);
  assert.match(prompt, /Image 2 is the sole visual material reference/i);
  assert.match(prompt, /Legs, wood, metal, plastic/i);
  assert.match(prompt, /same physical product/i);
});

test("validates fabric, mode and image count", () => {
  assert.equal(validateReupholsterInput({ files: [{}], fabricId: FABRICS[0].id, mode: "sync" }).fabric.id, FABRICS[0].id);
  assert.equal(validateReupholsterInput({ files: Array.from({ length: 6 }, () => ({})), fabricId: FABRICS[0].id, mode: "sync" }).fabric.id, FABRICS[0].id);
  assert.match(validateReupholsterInput({ files: [], fabricId: FABRICS[0].id, mode: "sync" }).error, /от 1 до 6/i);
  assert.match(validateReupholsterInput({ files: Array.from({ length: 7 }, () => ({})), fabricId: FABRICS[0].id, mode: "sync" }).error, /от 1 до 6/i);
  assert.match(validateReupholsterInput({ files: [{}], fabricId: "missing", mode: "sync" }).error, /ткань/i);
  assert.match(validateReupholsterInput({ files: [{}], fabricId: FABRICS[0].id, mode: "slow" }).error, /режим/i);
});

test("batch estimate keeps the 50 percent economy assumption visible", () => {
  assert.equal(BATCH_ESTIMATE_PER_IMAGE_USD, 0.045);
});
