# AGENTS.md

## Project

Activity Map is a privacy-first static web app that visualizes a user's Strava export. Keep it deployable to Cloudflare Pages without a server-side runtime.

## Commands

```sh
npm install
npm run dev
npm test
npm run build
```

Node.js 22.12 or newer is required. Before finishing a change, run both `npm test` and `npm run build`.

## Architecture

- `src/main.ts` owns the UI, Leaflet map, filters, summaries, and import lifecycle.
- `src/import.worker.ts` owns archive validation and parsing orchestration. Expensive parsing must remain off the main thread.
- `src/fit.ts` implements the minimal FIT parser needed for GPS record messages.
- `src/polyline.ts` owns route simplification and encoded polyline conversion.
- `src/activity.ts` owns activity classification, summaries, dates, and formatting.
- `src/storage.ts` is the only IndexedDB boundary.
- `src/types.ts` contains messages and shared domain types.

## Privacy invariants

- Never upload the Strava ZIP or parsed activity data to an application server.
- Never add analytics, telemetry, remote logging, authentication, cloud sync, Workers, R2, or a database without an explicit product decision.
- Persist activity data only after an explicit user action.
- Keep the map tile network disclosure visible when using external tile providers.
- Do not log activity names, coordinates, archive contents, or parsed data to a remote service.
- Treat precise routes as sensitive personal information.

## Archive safety

- Preserve limits for archive size, entry count, total expanded size, individual entries, nested GZIP output, and CSV size.
- Read ZIP entries individually. Do not eagerly expand an entire archive into memory.
- Parsing must remain cancellable by terminating the Web Worker.
- Malformed individual activities should be skipped and counted where possible; a malformed archive index or CSV should fail the import clearly.

## Code conventions

- Use strict TypeScript and existing small modules before introducing a framework.
- Prefer structured parsers over ad hoc text parsing.
- Keep UI copy understandable to people who do not know ZIP, FIT, GPX, or browser storage terminology.
- Keep generated data and real Strava exports out of Git.
- Add focused tests for pure parsing, classification, date, and polyline behavior.

## Product scope

The current MVP supports local ZIP import, FIT/GPX route extraction, route and heat views, sport filters, summary statistics, IndexedDB persistence, JSON export, progress, cancellation, and archive safety limits. Server uploads and multi-device sync are intentionally out of scope.
