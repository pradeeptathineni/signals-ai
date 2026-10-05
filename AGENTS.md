# Signals repository guide

Read `README.md`, root `ARCHITECTURE.md`, `docs/architecture/ADR-001-v0-foundation.md`, the latest numbered ADR, and `docs/architecture/schema.md` before changing cross-cutting behavior. Phase-specific execution evidence lives in the adjacent `../maestro-ai-planning/outputs/` workspace; do not copy private planning text into public code or fixtures.

## Boundaries

- Maestro owns evidence, query/selection policy, project context, decisions and human-directed lifecycle state. Cataloged systems remain data unless a later approved execution phase adds typed authority.
- Keep `catalog` public/shareable, `workspace` private, and `ops` operational. Public records must never depend on private workspace content.
- No candidate installation or execution, arbitrary crawling, cloud/model fallback, hosted auth, sandbox, gateway or agent-runtime implementation is authorized by the current intelligence-product scope.
- Preserve immutable records and old replay semantics. New corrections create revisions or append-only successors.
- Keep open-world interpretation, refinement, and organization in the bounded research-model protocol. Deterministic mechanisms should validate, constrain, retrieve, compare, or replay; do not add evaluation-query vocabulary or one-off semantic branches.

## Safe commands

- Inspect `package.json`, `scripts/verify.sh`, `packages/test-fixtures/src/database.ts`, `.env`, and the exact database URL before any DB command.
- Defaults use loopback port `54329` and may point at retained development data. For tests, provide explicit `DATABASE_URL` and `TEST_DATABASE_URL` for a named disposable database/container on a non-default port.
- `test:integration` and `test:e2e` drop the target test schemas. `verify` runs `db:init` against `DATABASE_URL` before rebuilding the test database. Never aim them at retained data.
- Prefer `npm test`, `npm run typecheck`, `npm run lint`, and `npm run format:check` for non-database checks. Run the complete gate only after destination isolation is proven.

## Code map

- `apps/web`: React UI and accessible list/map/detail/compare flows.
- `apps/api`: loopback Fastify/OpenAPI boundary; schemas come from `packages/contracts`.
- `apps/worker`: Graphile jobs and one retry owner for bounded external/local adapter work.
- `packages/domain`: pure identity, privacy, canonicalization and decision/query contracts.
- `packages/scoring`: pure versioned policies; no database or UI logic.
- `packages/db`: forward SQL migrations, Drizzle mirror and explicit repositories.
- `packages/adapters`: bounded external/local integrations; fetched content is untrusted data.
- `packages/seed`: deterministic, source-backed fixtures; live fetches never run during migration/CI.

Use `apply_patch` for deliberate source edits. Keep exact dependency versions, update `docs/dependencies.md`, and add negative tests for authority, privacy, evidence-binding and historical-continuity changes.

For broad repository analysis or noisy validation output, use the repository's `signals-context-engineering` skill. Treat generated packs as disposable maps, retain source files as authority, and recover any compressed command detail from its local `raw_ref` instead of rerunning work.
<!-- context-ai:begin -->
## Context AI project loadout
Project instructions and explicit task authority take precedence. Use the pinned `.context-ai/lock.json`.
Read `.context-ai/resources/skills/context-loadout/SKILL.md` for selection and use receipts.
Load only the modules for the current stage:
- inspect: `.context-ai/resources/core/engineering.md`, `.context-ai/resources/core/context.md`, `.context-ai/resources/overlays/prior-art.md`, `.context-ai/resources/domains/web/react.md`, `.context-ai/resources/domains/service/api.md`
- implement: `.context-ai/resources/core/development.md`, `.context-ai/resources/overlays/patterns.md`, `.context-ai/resources/overlays/code-comments.md`, `.context-ai/resources/core/code-comments.md`, `.context-ai/resources/domains/web/accessibility.md`, `.context-ai/resources/domains/web/performance.md`, `.context-ai/resources/domains/web/react.md`, `.context-ai/resources/domains/service/api.md`
- test: `.context-ai/resources/core/testing.md`, `.context-ai/resources/domains/web/browser-verification.md`
- review: `.context-ai/resources/core/review.md`, `.context-ai/resources/overlays/evidence-claims.md`, `.context-ai/resources/domains/web/design.md`, `.context-ai/resources/core/version-control.md`
- deliver: `.context-ai/resources/core/versioning.md`, `.context-ai/resources/overlays/delivery.md`, `.context-ai/resources/core/version-control.md`
- research: `.context-ai/resources/core/prior-art.md`, `.context-ai/resources/core/research.md`, `.context-ai/resources/procedures/research-evidence.md`, `.context-ai/resources/overlays/prior-art.md`, `.context-ai/resources/overlays/evidence-claims.md`
- design: `.context-ai/resources/domains/web/design.md`, `.context-ai/resources/domains/web/product-ux.md`
A selected recipe is not execution or deployment permission.
<!-- context-ai:end -->
