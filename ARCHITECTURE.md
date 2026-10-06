# Architecture

Signals has one bounded live discovery kernel and two host integrations: an invoking Agent Skill and an explicitly configured headless Codex CLI. Local UI, query discovery and Corpus refresh call that kernel. Literal/ranked Corpus retrieval remains a separate offline operation.

| Owner                                                                     | Responsibility                                                                                          |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `packages/domain/search-contract.ts`, `search-score.ts`                   | Closed model protocol, typed indicators, pure strength reducers, relevance/filter/save policy           |
| `packages/corpus/signal-search.ts`, `search-fetch.ts`, `search-runner.ts` | Bounded acquisition, SSRF-safe fetched evidence, supervised CLI and grounded extraction                 |
| `packages/corpus/search-store.ts`                                         | Validated entity writes, immutable evidence merge, judgment successors, writer lock and private history |
| `packages/corpus/search-scheduler.ts`, `search-settings.ts`               | Disabled-default interests, due slots, lease, retained outcomes and identity refresh                    |
| `packages/corpus/search-api.ts`, `scripts/workbench.ts`                   | Loopback-only same-origin typed API, owned run IDs, CSRF token, asset allowlist                         |
| `apps/corpus`                                                             | Search/Corpus/Settings, evidence inspection, filter/compare/save and static read-only view              |
| `signals/entities/*.json`                                                 | Canonical native records using signal-strength-v0                                                       |
| `signals/<type>/*.json`                                                   | Legacy findings with original signal-review-v1 meaning and frozen evidence                              |
| `.signals/`                                                               | Private questions/runs/settings/cache/schedule state and retained history                               |
| `dist/`                                                                   | Disposable public snapshots and Pages assets                                                            |

The model interprets questions, plans domain-appropriate acquisition, resolves conservative identities and supplies source-bound semantic observations. Code owns the fixed score formula. Headless discovery is followed by bounded no-web extraction over fetched excerpts, replacing preliminary observations. Native hosts perform source grounding in their invoking agent. Quote checks establish text occurrence only; model judgments remain fallible.

The six-feature strength policy has fixed normalizers and type-specific currentness windows. Unknown inputs earn zero; repeated publisher/origin/source groups do not create independent support. Relevance is query-dependent. Automatic admission requires supported defining evidence, resolved identity, a direct match and the configured threshold. Manual saves permit supported lower-strength knowledge. Legacy minimum-review policy applies only to historical records.

Entity evidence is immutable. An observation's stable basis binds entity, source bytes, feature and quote; changed indicator/status/independence creates a successor judgment. Scoring excludes superseded judgments; replay of an old observation cannot restore credit. Types retain URI identities. Monorepo subresources remain distinct; conflicting URI aliases fail closed. Per-entity atomic rename and a cooperating writer lock permit safe retries without claiming batch transactionality.

The CLI owns authentication. A disposable read-only runner disables shell, hooks, plugins, apps, memories, MCP execution and delegation. Process-group cancellation and output/time/tool limits bound it. Retrieved instructions cannot change permissions. Evidence fetching validates DNS, pins the connected address, checks redirects and limits bytes/time. Failed sources remain inspectable.

Local endpoints accept loopback Host and same-origin requests. Mutations require a random session token; schemas reject arbitrary commands/paths. UI saves select server-owned results. Asset serving denies private files and symlink escapes. Pages contains public records only and has no live runner.

Scheduled discovery uses durable slots and one lease. Completion follows retained results and canonical saves; interrupted inference becomes uncertain rather than silently repeated. Publication defaults to local-only. Existing build/Pages CI remains the hosting path.

[ADR-011](docs/architecture/ADR-011-live-signal-search.md) governs current discovery/scoring. [ADR-009](docs/architecture/ADR-009-database-retirement-and-signal-admission.md) governs database retirement and retained legacy admission; [ADR-010](docs/architecture/ADR-010-ranked-word-retrieval.md) governs offline ranked retrieval. Frozen schema-v1 exchange and private snapshots retain their original identities, dates and policy meanings.
