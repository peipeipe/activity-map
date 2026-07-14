# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Activity Map is a privacy-first static web app that visualizes a user's Strava export (ZIP of `activities.csv` + FIT/GPX route files) on a map, entirely in the browser. It is deployable to Cloudflare Pages with no server-side runtime — this constraint is load-bearing for every design decision here, not just a deployment detail.

## Commands

```sh
npm install
npm run dev       # vite dev server
npm test          # TMPDIR=/tmp vitest run
npm run build     # tsc -b && vite build
npm run check     # tsc -b only
npm run pages:deploy   # build + wrangler pages deploy (manual prod deploy)
```

Node.js >=22.12 is required. Run both `npm test` and `npm run build` before finishing a change — `npm run build` also type-checks via `tsc -b`.

To run a single test file: `npx vitest run src/activity.test.ts`.

## Architecture

- `src/main.ts` — UI, Leaflet map, filters, summaries, import lifecycle. The orchestration layer.
- `src/import.worker.ts` — archive validation and parsing orchestration, running in a Web Worker. Expensive parsing must stay off the main thread; this file owns that boundary.
- `src/fit.ts` — minimal FIT parser for GPS record messages only (not a general FIT library).
- `src/polyline.ts` — route simplification and encoded polyline conversion.
- `src/activity.ts` — activity classification, summaries, dates, formatting.
- `src/storage.ts` — the *only* IndexedDB boundary; no other module should touch IndexedDB directly.
- `src/types.ts` — worker messages and shared domain types.

Tests exist for the pure/parsing modules (`activity.test.ts`, `polyline.test.ts`); worker orchestration and UI are not unit tested.

## Privacy invariants

These are product requirements, not suggestions — changes that violate them need an explicit product decision first:

- Never upload the Strava ZIP or parsed activity data to an application server.
- Never add analytics, telemetry, remote logging, authentication, cloud sync, Workers, R2, or a database without an explicit product decision.
- Persist activity data only after an explicit user action (the "save to device" flow into IndexedDB).
- Keep the map tile network disclosure visible when using external tile providers (CARTO/OSM/GSI).
- Do not log activity names, coordinates, archive contents, or parsed data to a remote service.
- Treat precise routes as sensitive personal information.

## Archive safety

Import limits exist to bound memory use against malformed or hostile archives (zip bombs): 8GB ZIP, 10,000 entries, 4GB total expanded size, 512MB per entry (including nested GZIP output), 64MB for `activities.csv`. When touching `import.worker.ts`:

- Read ZIP entries individually — never eagerly expand a whole archive into memory.
- Parsing must remain cancellable by terminating the Web Worker.
- A malformed *individual* activity should be skipped and counted, not fail the whole import; a malformed archive index or CSV should fail the import clearly.

## Conventions

- Strict TypeScript, small focused modules — reach for a framework only if the current approach genuinely can't scale, not by default.
- Prefer structured parsers (fast-xml-parser, Papa Parse, zip.js/fflate) over ad hoc text parsing.
- Keep UI copy understandable to people who don't know ZIP/FIT/GPX/browser-storage terminology (much of the README/UI is in Japanese for the primary audience).
- Keep generated data and real Strava exports out of Git.
- Add focused tests for pure parsing, classification, date, and polyline behavior when changing those modules.
- Server uploads and multi-device sync are intentionally out of scope for the current MVP — don't build toward them speculatively.

## Deploy

Push to `main` triggers `.github/workflows/deploy.yml`: install, `npm test`, `npm run build`, then `wrangler pages deploy dist --project-name activity-map`. Cloudflare Pages config: build command `npm run build`, output dir `dist`, root `/`.
