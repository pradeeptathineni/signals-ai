# Signals repository guide

Read `README.md`, `ARCHITECTURE.md`, ADR-001, the latest numbered ADR, and `docs/architecture/schema.md` before cross-cutting changes. Historical ADRs describe superseded systems; ADR-009 governs the current file-based product. Private phase evidence remains in `../maestro-ai-planning/outputs/`; never copy it into public records or fixtures.

## Boundaries

- Git is the public Corpus database. `signals/<type>/*.json` is canonical; indexes and Pages are generated views. Domains and concepts are metadata, not duplicated folder trees.
- `.signals/` is private local query/history storage. Never publish it, serve it through Vite, or remove retained snapshots during cleanup. Database services, containers, drivers and compatibility commands have been retired.
- Systems remain data. No candidate installation/execution, arbitrary crawling, hosted auth, cloud/model fallback, sandbox, gateway or agent-runtime implementation is authorized.
- Evidence is immutable. Corrections create successors; historical commits and migrated rows preserve old policy meanings. Review metadata may withdraw a finding without rewriting its evidence.
- Keep interpretation and organization in the bounded model protocol. Deterministic code validates, filters, retrieves, compares, admits and replays. Do not add evaluation vocabulary or one-off semantic branches.
- Automatic admission requires supported material claims and a separate model review meeting every signal dimension. Scores are ordinal judgment, never calibrated probability or proven user benefit. Humans ask questions; agents generate technical evidence and review metadata.

## Commands and code map

- `npm run verify` checks the file-based product and isolated browser fixtures. It requires no database or model service. `npm run clean` removes generated build/test output only.
- `npm run research -- query QUESTION` saves a private result. An explicitly configured loopback model can organize and separately challenge known evidence. Failure preserves deterministic matches and reports the gap.
- `apps/corpus`: Pages view and development-only same-origin query save endpoint.
- `packages/domain`: frozen evidence decoding, public projection, literal retrieval, bounded model query and signal policy.
- `packages/corpus`: native record validation, atomic export/admission, private query/history files and explicit loopback model client.
- `packages/contracts`: frozen schema-v1 interchange. `concepts.json`: the actual Signals concept catalog used in coverage evaluation.

Use `apply_patch` for deliberate source edits. Keep exact dependency versions and `docs/dependencies.md` current. Add negative tests for privacy, authority, evidence binding and historical continuity.

For broad analysis or noisy validation, use `signals-context-engineering`. Generated packs are disposable maps. Source remains authoritative; recover compressed output from its local `raw_ref` before rerunning commands. CCA references preserve normalized/redacted text, not necessarily the original byte stream.
<!-- context-ai:begin -->
## Context AI project loadout
Project instructions and explicit task authority take precedence. Use the pinned `.context-ai/lock.json`.
Read `.context-ai/resources/skills/context-loadout/SKILL.md` for selection and use receipts.
Load only the modules for the current stage:
- deliver: `.context-ai/resources/core/versioning.md`, `.context-ai/resources/overlays/delivery.md`, `.context-ai/resources/core/version-control.md`
- design: `.context-ai/resources/domains/web/design.md`, `.context-ai/resources/domains/web/product-ux.md`
- implement: `.context-ai/resources/core/development.md`, `.context-ai/resources/overlays/patterns.md`, `.context-ai/resources/overlays/code-comments.md`, `.context-ai/resources/core/code-comments.md`, `.context-ai/resources/core/prior-art.md`, `.context-ai/resources/overlays/writing.md`, `.context-ai/resources/domains/service/api.md`, `.context-ai/resources/domains/web/accessibility.md`, `.context-ai/resources/domains/web/performance.md`, `.context-ai/resources/domains/web/react.md`
- inspect: `.context-ai/resources/core/engineering.md`, `.context-ai/resources/core/context.md`, `.context-ai/resources/overlays/prior-art.md`, `.context-ai/resources/core/version-control.md`, `.context-ai/resources/domains/service/api.md`, `.context-ai/resources/domains/web/react.md`
- research: `.context-ai/resources/core/prior-art.md`, `.context-ai/resources/core/research.md`, `.context-ai/resources/procedures/research-evidence.md`, `.context-ai/resources/overlays/prior-art.md`, `.context-ai/resources/overlays/evidence-claims.md`
- review: `.context-ai/resources/core/review.md`, `.context-ai/resources/overlays/evidence-claims.md`, `.context-ai/resources/domains/web/design.md`
- test: `.context-ai/resources/core/testing.md`, `.context-ai/resources/domains/web/browser-verification.md`
A selected recipe is not execution or deployment permission.
<!-- context-ai:end -->
