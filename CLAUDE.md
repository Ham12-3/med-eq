# MedAsset: medical equipment asset and maintenance tracker

## What this is
A web app for hospital clinical engineering teams (UK, MHRA "Managing Medical Devices" 2021).
It tracks every device, where it was last scanned, PPM due dates, repairs, safety tests and safety notices.
A 3D building view shows each device in its last known room, coloured by status.

## Stack
Next.js App Router, TypeScript strict, PostgreSQL + Drizzle, Tailwind + shadcn/ui,
React Three Fiber + drei, Vitest, Playwright. Package manager: pnpm.

## Non-negotiable rules
- Never delete or overwrite records. Every change writes to audit_log (old value, new value, user, time).
- An asset with overdue PPM, a failed safety test or an open safety notice is "Do not use" everywhere.
- A work order cannot close until every required test in its template has a result.
- All synthetic data only. No real patient data, ever.
- No real manufacturer names or logos in data, images or 3D models. Use generic names.

## 3D conventions
- Units: metres. Y up in three.js, Z up in Blender (export with +Y up).
- Room meshes are named room_<GLN>. Device models are named model_<device_model_slug>.
- Final models live in public/models as .glb with Draco geometry and KTX2 textures.
- Target: under 30k triangles per device, textures 2K max.

## Project layout
- `app/` Next.js routes
- `db/` Drizzle schema, migrations, seed
- `lib/rules/` EM score, PPM due dates, do-not-use logic
- `components/3d/` React Three Fiber scene, loaders, highlights
- `public/models/` final .glb files the app loads
- `art/refs/` Nano Banana reference images
- `art/video/` Veo clips
- `art/blend/` .blend source files
- `art/prompts/` every image and video prompt used
- `scripts/` gemini-images.ts, gemini-video.ts, optimise-glb.sh

## Tools in this project
- Blender is connected via the MCP for Blender server. Use `look` after every change to check the result.
- Image and video generation goes through scripts/ using the Gemini API (GEMINI_API_KEY). Log every prompt in art/prompts/.
- Use Chrome to test the running app at localhost:3000.

## How to work
- Plan first, then build in small steps. Run tests before saying a step is done.
- Ask before adding a new dependency.
- PLAN.md holds the status rules, route map and milestones. Follow it. `db/schema.ts` is now the source of truth for the schema.
- This is Next.js 16: read AGENTS.md and the docs in `node_modules/next/dist/docs/` before writing Next code.
- Every database write goes through `withUser(db, userId, tx => ...)` in `db/client.ts`. The audit trigger rejects writes without a user.
- Server actions that write use `authorizedWrite(action, (tx, user) => ...)` from `lib/auth/session.ts`: it re-checks the session and `can(user, action)` itself, then calls `withUser`. Pages call `requirePermission(action)` inside a `<Suspense>` boundary (Cache Components makes a session read outside one a build error).
- Roles, actions, role home pages and route permissions live in `lib/auth/permissions.ts`. Add new routes to `ROUTE_ACTIONS` there. The proxy only checks the cookie; never rely on it alone.
- Commands are listed in README.md. `pnpm test` needs Docker running (`pnpm db:up`); `pnpm test:unit` does not.
- "Do not use" rules live twice: `lib/rules/assetStatus.ts` and the SQL function `asset_status_on()`. Change both together; `tests/db/status-parity.test.ts` fails if they drift.
- Job closing rules and their effects are pure functions in `lib/rules/workOrder.ts`; `closeJob()` in `lib/data/workOrders.ts` applies them inside one locked transaction. Change the rules there, not in the pages.
- Client components never import values from `lib/data/*` (it pulls database code into the browser). Shared constants live in pure modules such as `lib/rules/*` or `lib/incidents.ts`; `import type` from `lib/data` is fine.
- Pages that read the database call `getCurrentUser()`/`requirePermission()` first: it calls `connection()`, which keeps database and Auth.js work out of the prerender.
