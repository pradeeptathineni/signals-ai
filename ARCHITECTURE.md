# Architecture

Signals has three active responsibilities: maintain reviewed Git knowledge, retrieve/organize
it for a question, and render the same findings for people and machines.

| Owner                                      | Responsibility                                                                                              |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `signals/<type>/*.json`                    | Canonical public findings, source-bound claims and separate signal review                                   |
| `packages/domain`                          | Exact contracts, source/identity/privacy checks, literal filters and bounded model judgments                |
| `packages/corpus`                          | File reading, atomic admission, private query saving, historical file reads and derived exports             |
| `apps/corpus`                              | React search/filter/compare view; existing Vite server saves private local questions                        |
| `scripts/corpus.ts`, `scripts/research.ts` | Machine search, agent context, explicit model organization and admission                                    |
| `.signals/`                                | Private queries, drafts, retained immutable history and local evaluations; never served or built into Pages |
| `dist/`                                    | Disposable complete public snapshots and static Pages assets                                                |

The same pure filter and identities drive browser and CLI. Literal search has no semantic
word dictionary. Model interpretation receives the constrained evidence universe, selects only
known IDs/claims and gets a separate review. Rejected first-model summaries never become answers.
Model failures preserve deterministic results; source acquisition through the host agent is
labelled agent-assisted. An explicit loopback model does not imply a configured-live quality proof.

A finding is automatically admitted only when every option passes the versioned signal policy.
Fatal privacy, authority, unsupported-claim and currency problems take precedence over ratings.
The minimum dimension score prevents attractive prose from compensating for weak evidence.
Publication checks exact shared identities and complete record validity before a non-overwriting
atomic link; a scoped lock serializes cooperating writers. Interrupted private staging does not
become public data. Git review and commits remain the publication boundary.

The public export completes all bytes before atomically switching its derived pointer. Withdrawn
records retain original downloads and Git history. Source observations, reviews and publication
dates remain distinct. Hashes protect byte identity, not truth or independence. Current records
use native JSON; two pinned historical encodings preserve old download bytes.

The database/API/worker application is retired. All retained project data was exported and checked
before container/volume removal. Historical catalog and workspace records remain private immutable
JSONL snapshots with counts, column inventories and hashes. Frozen schema-v1 bundles still decode
without changing old meaning; their original implementation remains in Git history.

[ADR-009](docs/architecture/ADR-009-database-retirement-and-signal-admission.md) governs storage and admission;
[ADR-010](docs/architecture/ADR-010-ranked-word-retrieval.md) governs current retrieval. ADR-009 is the
cross-cutting decision. Earlier ADRs describe historical choices; they do not enable retired services.
