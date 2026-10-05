# ADR-009: Retire the database and admit only reviewed high signal

Status: accepted, 2026-10-05. Supersedes the PostgreSQL option in earlier decisions.

Git-held JSON is the only active Corpus authority. The existing development server and CLI
read the same records. Local questions and historical state are private files under ignored
`.signals/`; the public builder never reads that directory. Vite also denies serving it.
There is no database service, API/worker stack, Docker configuration or alternative database mode.

Before retirement, all 83 local project database snapshots were exported: 981,522 rows,
including 450,160 catalog rows. Complete empty-table/column inventories, file hashes and
independent repeated source exports passed. Four representative snapshots passed typed restore
and exact canonical row/multiplicity comparisons. Different server collations changed ordering,
so restoration compared row multisets rather than pretending stream order was data identity.
Original source commits and private restore archives remain; four containers and their exclusive
volumes were removed. Historical records are immutable preserved observations, not automatic
high-signal admissions. No private history was published.

An acquired finding now needs a separate model review of every option. The review assesses
relevance to its stated need, source applicability, actionable usefulness and clarity/scope.
Each uses ordinal levels 0 absent, 1 weak, 2 partial, 3 strong, 4 exceptional. The weakest level
times 25 gives a policy score; admission requires at least 75 and no fatal blockers. Missing
support, privacy/authority problems and unresolved claim currency cannot be averaged away.
This is a conservative operational threshold, not calibrated confidence or probability.

Users supply questions. The agent acquires evidence, creates records, requests second review
and invokes atomic admission. Humans do not author receipts, hashes or review forms. Source
identity, dates and internal review reasons remain valuable because they explain scope and
permit corrections. Exact bundle hashes remain for download verification and old consumer pins;
separate receipt graphs, manual sidecars and database readiness workflows leave the active product.

Deterministic search, constraints, identity checks, source bindings, budgets and writes remain
substantial owners. Model interpretation and second review operate on that exact constrained
universe, with explicit abstention. A failed model leaves indexed results available. The configured
model path is explicit loopback HTTP only; the host agent can also research through its existing
public-source tools. No silent provider fallback or candidate execution is added.

Independent review held two previously admitted findings at 50. Their exact evidence remains
withdrawn and downloadable; narrowed successors require fresh review. It also found summary
survival after rejection, cross-kind identity collisions and private-file serving. Regression
checks protect those boundaries. Corpus coverage, live model quality and human usefulness still
need separate evidence; no test can establish correct answers for every possible query.
