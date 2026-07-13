# Design QA — SOFA.SHOT fabric replacement

- Source visual truth: `/Users/dima/Documents/Снимок экрана 2026-06-23 в 01.25.40.png`
- Primary implementation: `/Users/dima/Documents/Sofa.ai/qa-fabric-primary-desktop.png`
- Full-view comparison evidence: `/Users/dima/Documents/Sofa.ai/qa-comparison-fabric.png`
- Fabric selector evidence: `/Users/dima/Documents/Sofa.ai/qa-fabric-results.png`
- Apply-mode evidence: `/Users/dima/Documents/Sofa.ai/qa-fabric-preview.png`
- Mobile evidence: `/Users/dima/Documents/Sofa.ai/qa-fabric-mobile-results.png`
- Viewports: desktop `1440 × 1024`, results `1440 × 900`, mobile `390 × 844`
- States: initial screen; three ready results; fabric selected; hero preview ready with immediate/economy choices

**Findings**

- No actionable P0, P1, or P2 findings remain.
- Fonts and typography: Cormorant Garamond and Manrope preserve the approved editorial serif/sans hierarchy, Cyrillic support and restrained optical weight. The fabric title, receipt and preset labels continue the same hierarchy without introducing dashboard typography.
- Spacing and layout rhythm: the original split-screen composition remains unchanged. The new control is contained inside the existing results section, separated by one hairline and generous vertical space. Desktop uses a quiet selector/action split; mobile collapses to one readable column with full-width tap targets.
- Colors and visual tokens: the new surface uses the existing charcoal result background, warm ivory type, muted secondary copy and oxblood active/action color. No gradients, analytics cards or secondary navigation were added.
- Image quality and asset fidelity: all six presets are dedicated generated raster macro photographs with distinct weave/pile behavior. They are locally stored, compressed project assets rather than placeholders, CSS art or repeated generic swatches.
- Copy and content: the flow clearly separates one paid hero preview from “Сразу” and “Экономно −50% · до 24 часов”. Privacy copy now discloses temporary Batch storage. Generated variants are visibly labelled with the chosen fabric.
- Interaction states: fabric selection, preview loading/error/success, immediate application, Batch queue/poll/completion/failure, reset to original and downloading the active variant are implemented. Edits always use the original generated data URL.
- Responsiveness and accessibility: six radios expose fabric names and tones, status messages use live semantic regions, controls have visible focus/disabled states, and the 390 px layout has no overlap or horizontal clipping.

**Open Questions**

- The approved source does not include a results/fabric state. The new section was therefore checked against the source’s visual language rather than a pixel-identical state; this is an intentional product extension.

**Patches made in this pass**

- Added six generated fabric reference assets and a shared preset registry.
- Added a geometry-locked, material-specific `gpt-image-2` edit prompt and exact synchronous cost accounting.
- Added persistent OpenAI Batch jobs through `/v1/responses`, polling and delayed result hydration.
- Added desktop/mobile fabric selection, hero preview, immediate/economy apply choices, progress, error and reset states.
- Added development-only result/preview fixtures for reproducible visual QA without spending API tokens.

**Implementation Checklist**

- [x] Approved source and current primary screen inspected in one combined comparison image.
- [x] Fabric selector and post-preview controls inspected at desktop size.
- [x] Fabric selector and action controls inspected at 390 px mobile width.
- [x] Six preset images inspected and represented by real raster assets.
- [x] Unit tests and production build pass.
- [x] Live Batch smoke test completed: 1 request, 1 success, 0 failures, output image hydrated.
- [x] Browser console contains no application errors in the verified states.

**Follow-up Polish**

- P3: replace generated preset references with calibrated supplier photographs if the product later promises SKU-level accuracy.
- P3: add an automatic upholstery mask only if real usage shows unacceptable background drift.

final result: passed
