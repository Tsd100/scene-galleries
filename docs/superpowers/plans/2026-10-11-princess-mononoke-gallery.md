# Princess Mononoke Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build and publish a 16-scene offline Princess Mononoke-inspired gallery inside the existing scene collection.

**Architecture:** Reuse the static gallery player contract already proven by `sky-city-gallery`: scene data lives in one small JavaScript file, the player reads that data without build tooling, and all image assets are local. Give the project its own theme and tests while updating only the collection-level navigation and documentation.

**Tech Stack:** HTML, CSS, vanilla JavaScript, Node.js test runner, generated WebP images

---

### Task 1: Define and validate scene data

**Files:**
- Create: `princess-mononoke-gallery/scenes.js`
- Create: `princess-mononoke-gallery/tests/scene-data.test.cjs`

- [x] Write a Node test that loads `window.MONONOKE_SCENES`, asserts 16 unique IDs, four chapters of four scenes, local main/thumbnail paths, and valid hotspot destinations.
- [x] Run `node --test princess-mononoke-gallery/tests/scene-data.test.cjs`; expect failure because `scenes.js` does not exist.
- [x] Add the 16 scene records and route branches defined in the approved design.
- [x] Run the test again; expect the structural checks to pass while asset checks still fail.

### Task 2: Build the gallery shell

**Files:**
- Create: `princess-mononoke-gallery/index.html`
- Create: `princess-mononoke-gallery/app.js`
- Create: `princess-mononoke-gallery/style.css`

- [x] Copy the established static player interaction contract and rename all labels, titles, home target, scene count, and accessibility text for this gallery.
- [x] Apply the dark forest, bone-white, and vermilion theme with responsive 16:9/3:4 framing and reduced-motion rules.
- [x] Verify source references with `rg -n "SKY_SCENES|天空之城|assets/" princess-mononoke-gallery`; expect only the new asset references and no stale product labels.

### Task 3: Generate and prepare artwork

**Files:**
- Create: `princess-mononoke-gallery/assets/01-emishi-mist.webp` through `16-new-green.webp`
- Create: `princess-mononoke-gallery/assets/thumbs/*.webp`

- [x] Generate one 16:9 illustration per scene using the shared late-1990s hand-painted cel animation art direction and the scene-specific composition.
- [x] Inspect representative forest, ironworks, night, and rebirth images for consistent texture, palette, framing, and absence of text or watermarks.
- [x] Convert final images to WebP and create smaller thumbnails without changing aspect ratio.
- [x] Run the scene-data test; expect all checks to pass.

### Task 4: Integrate and document

**Files:**
- Modify: `index.html`
- Modify: `README.md`
- Modify: `ASSET_POLICY.md`

- [x] Add a directly-openable gallery card to the collection homepage.
- [x] Add the gallery to the README project table and structure list.
- [x] State that its generated fan-art assets are excluded from the MIT code license.

### Task 5: Verify and publish

**Files:**
- Test: `princess-mononoke-gallery/tests/scene-data.test.cjs`

- [x] Run the new data test and the existing `sky-city-3d` test suite.
- [x] Open the gallery through a local HTTP server and verify initial render, next/previous navigation, directory, one hotspot, and mobile layout.
- [x] Scan tracked files for credentials, absolute machine paths, movie screenshots, caches, and build output.
- [x] Commit with message `Add Princess Mononoke scene gallery` and push `main` to the configured GitHub remote.
