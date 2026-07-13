import path from "node:path";
import fs from "node:fs/promises";
import { getShotSet } from "../shared/shotSets.js";

export const QA_SOURCES = Object.freeze([
  "api-preview",
  "api-preview-lock",
  "api-final",
  "codex-simulation",
  "manual",
]);

export const QA_ACCEPTANCE_CHECKLIST = Object.freeze([
  "Leg count, shape, material and position match the product reference or remain correctly occluded.",
  "The sofa footprint, rug/floor contact, wall distance, scale and seat height do not move between preview and final.",
  "Cushion inventory, seams, piping, tufting and upholstery texture remain the same product.",
  "Room identity, lighting direction and camera intent stay coherent across the shot set.",
  "Any chat/Codex simulation output is treated as prompt QA only, not production API proof.",
]);

export function buildQaManifest({
  source,
  sceneId,
  shotSetId,
  cost = null,
  notes = "",
  prompts = {},
  artifacts = [],
  createdAt = new Date(),
}) {
  if (!QA_SOURCES.includes(source)) {
    throw new Error(`Unsupported QA source: ${source}`);
  }
  const shotSet = getShotSet(shotSetId);
  return {
    id: qaRunId(createdAt),
    source,
    createdAt: createdAt.toISOString(),
    sceneId,
    shotSet: {
      id: shotSet.id,
      name: shotSet.name,
      summary: shotSet.summary,
      count: shotSet.count,
    },
    notes,
    cost,
    prompts: Object.keys(prompts).sort(),
    artifacts: artifacts.map((artifact, index) => ({
      index,
      role: artifact.role || "artifact",
      label: artifact.label || artifact.name || `artifact-${index + 1}`,
      sourcePath: artifact.filePath || null,
    })),
    acceptanceChecklist: QA_ACCEPTANCE_CHECKLIST,
  };
}

export async function createQaExport({
  root,
  source,
  sceneId,
  shotSetId,
  cost = null,
  notes = "",
  prompts = {},
  artifacts = [],
  createdAt = new Date(),
}) {
  const manifest = buildQaManifest({
    source,
    sceneId,
    shotSetId,
    cost,
    notes,
    prompts,
    artifacts,
    createdAt,
  });
  const folder = path.join(root, "qa", "generation", manifest.id);
  const imageDir = path.join(folder, "images");
  const promptDir = path.join(folder, "prompts");
  await fs.mkdir(imageDir, { recursive: true });
  await fs.mkdir(promptDir, { recursive: true });

  const writtenPrompts = [];
  for (const [name, prompt] of Object.entries(prompts).sort(([a], [b]) => a.localeCompare(b))) {
    const filename = `${sanitizeName(name)}.txt`;
    await fs.writeFile(path.join(promptDir, filename), String(prompt || ""), "utf8");
    writtenPrompts.push({ name, path: path.join("prompts", filename) });
  }

  const writtenArtifacts = [];
  for (const [index, artifact] of artifacts.entries()) {
    const baseName = sanitizeName(
      artifact.name || artifact.label || `${String(index + 1).padStart(2, "0")}-artifact`,
    );
    if (artifact.dataUrl) {
      const { buffer, extension, mime } = parseDataUrl(artifact.dataUrl);
      const filename = `${baseName}.${extension}`;
      await fs.writeFile(path.join(imageDir, filename), buffer);
      writtenArtifacts.push({
        index,
        role: artifact.role || "artifact",
        label: artifact.label || artifact.name || filename,
        mime,
        path: path.join("images", filename),
      });
      continue;
    }
    if (artifact.filePath) {
      const sourcePath = path.resolve(root, artifact.filePath);
      const extension = path.extname(sourcePath) || ".jpg";
      const filename = `${baseName}${extension}`;
      await fs.copyFile(sourcePath, path.join(imageDir, filename));
      writtenArtifacts.push({
        index,
        role: artifact.role || "artifact",
        label: artifact.label || artifact.name || filename,
        path: path.join("images", filename),
      });
    }
  }

  const finalManifest = {
    ...manifest,
    prompts: writtenPrompts,
    artifacts: writtenArtifacts,
  };
  await fs.writeFile(path.join(folder, "manifest.json"), `${JSON.stringify(finalManifest, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(folder, "REVIEW.md"), buildReviewMarkdown(finalManifest), "utf8");

  return {
    id: finalManifest.id,
    folder,
    manifestPath: path.join(folder, "manifest.json"),
    reviewPath: path.join(folder, "REVIEW.md"),
    source: finalManifest.source,
    artifactCount: finalManifest.artifacts.length,
    promptCount: finalManifest.prompts.length,
  };
}

export function parseDataUrl(dataUrl) {
  const match = /^data:([^;,]+);base64,([a-z0-9+/=\s]+)$/i.exec(String(dataUrl || ""));
  if (!match) throw new Error("Invalid data URL artifact.");
  const mime = match[1].toLowerCase();
  const extension = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  return {
    mime,
    extension,
    buffer: Buffer.from(match[2].replace(/\s/g, ""), "base64"),
  };
}

function buildReviewMarkdown(manifest) {
  const artifactLines = manifest.artifacts.length
    ? manifest.artifacts.map((artifact) => `- [ ] ${artifact.label}: \`${artifact.path}\``).join("\n")
    : "- [ ] No visual artifacts attached yet.";
  const promptLines = manifest.prompts.length
    ? manifest.prompts.map((prompt) => `- ${prompt.name}: \`${prompt.path}\``).join("\n")
    : "- No prompt files saved.";
  const checklist = manifest.acceptanceChecklist.map((item) => `- [ ] ${item}`).join("\n");
  return `# Sofa.ai QA Run ${manifest.id}

- Source: \`${manifest.source}\`
- Scene: \`${manifest.sceneId}\`
- Shot set: \`${manifest.shotSet.name}\` (${manifest.shotSet.summary})
- Created: ${manifest.createdAt}
- Notes: ${manifest.notes || "None"}

## Artifacts

${artifactLines}

## Prompts

${promptLines}

## Acceptance

${checklist}
`;
}

function qaRunId(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function sanitizeName(value) {
  return String(value || "artifact")
    .toLowerCase()
    .replace(/[^a-z0-9а-яё_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "artifact";
}
