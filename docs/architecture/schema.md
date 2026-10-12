# Data map

Public JSON is canonical knowledge. Local JSON is private working state. Indexes and Pages assets are disposable projections. Closed schemas reject unknown fields, duplicate keys, forged bindings, ambiguous identities and score tampering.

| Data               | Authority and shape                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Native entity      | `signals/entities/entity-<URI hash>.json`; closed recordVersion2 wrapper with user-saved or eligible-saved state                                       |
| Identity           | Canonical URI and aliases; independent of kind/query/name; repository roots use conservative GitHub identity                                           |
| Evidence           | Source URI/publisher/family/origin, publication date, fetch time, raw/excerpt digests, acquisition state and matched excerpts                          |
| Observation        | Model statement/indicator/status/independence, evidence ID, quote, span flag, derivation, basis and judgment successors                                |
| Assessment         | Declared policy and explicit asOf; features/bindings, nullable score, missing dimensions and reasons                                                   |
| Query result       | schemaVersion2 run/question, original brief, interpreted need, items with separate relevance/priority/discovery/delta, gaps, budgets, usage and counts |
| Historical finding | `signals/<type>/*.json`; recordVersion1 frozen schema1 evidence with original signal-review-v1                                                         |
| Exchange           | Frozen schema1 evidence; native strengths, fetch dates and query/advisory meanings in separate extensions                                              |
| Generated view     | `dist/` contains public library/entities, historical indexes/downloads and Pages assets                                                                |
| Concepts           | `concepts.json` is the Signals catalog; `config/context-concepts.json` is a source-digested Context research snapshot                                  |

Active native brief v7 carries `query-relevance-v1` and `signal-strength-v10`. The entity's source-bound `signalBasis` permits deterministic type-rubric replay. Historical v0–v9 keep their declared meanings; brief v4 selects v7, v5 selects v8 and v6 selects v9. Optional bound origin inspections distinguish acquisition location, publishing venue and originating effort. Entity-level retained decisive observation IDs carry unresolved negative bindings through every refresh format without rewriting observations or old numerical policy semantics. Earlier nested basis metadata remains readable. These are internal lineage references, not model-authored fields. Current automatic admission can hold a historical receipt without changing its numerical score. Query assessment exchange validates exported source IDs against the bundle. Query relevance, priority, discovery trails, personal decisions and entity deltas never become intrinsic evidence. See the [assessment contract](../signals-contract.md).

Evidence is append-only. `excerptDigest` distinguishes projections, `normalizer: text-v2` binds normalized text, `currentEvidence` selects snapshots, and `currentChecks` binds actual reacquisition. New observation `identityVersion2` includes claim wording. Corrections create successor judgments; cyclic supersession and unbound/forged spans fail validation. Original dates and frozen downloads remain unchanged. Per-file atomic writes serialize through a cooperating writer lock.

## Private state

An optional linked `claimCheck` inside a private run contains exact proposition/parent digests and one or two indexed primary-material outcomes. Usable text is limited to 48,000 combined UTF-16 units and retained with its own SHA256, distinct from original document lineage. Explicit historical excerpts preserve original dates and scope; their captured closure remains readable if the origin's temporary run expires. Source denials/whole-document omissions and cancelled review remain separate from semantic verdicts. Rejected output has a bounded diagnostic prefix with captured-byte counts and truncation scope. Run serialization and replay retain the existing two-million-byte ceiling. Memory mode writes no receipt or source cache.

All of `.signals/` is ignored, excluded from public assets and denied by local/static serving. Public admission additionally rejects private bytes. Private history may retain source text containing credential-shaped documentation placeholders; structure, identity and evidence bindings still validate.

| State                                             | Purpose                                                                                                                                  |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `settings.json`                                   | Interests, website scopes, acquisition groups, followed sources, runner references, budgets, disabled-default recurrence and publication |
| `runs/` and `queries/`                            | Original answers, valid items, provisional leads, source text, gaps, usage and saved outcomes; saved questions need no retrieval receipt |
| `acquisitions/`, `extractions/`, `source-cache/`  | Private original proposals and review receipts; fetched-text cache expires after one hour                                                |
| `library-leads.json`                              | Unassessed URI identities and append-only saved contexts; never manufactured scored entities                                             |
| `library-preferences.json`                        | Explicit metadata-egress permission and disabled-default personal autosaving                                                             |
| `library-state.json`, `personal.json`             | Qualified saved selections, historical/native annotations and personal feedback                                                          |
| `selections.json`                                 | Saved identities associated with run/question/interest/concepts, including unchanged entities                                            |
| `projects.json` and project history               | Registrations, current context, immutable imported originals and personal opportunity decisions                                          |
| `inbox.json`                                      | Promising leads and dismissals, separate from Corpus admission                                                                           |
| `source-state.json`                               | Last successful material, checks, scans, result exposures and verified per-entity parent feedback                                        |
| `providers.json`                                  | Optional closed provider settings; see [providers](../providers.md)                                                                      |
| Discovery/batch state, attempts, locks and leases | Frozen lists/pools, due slots, overlap control, resume and interrupted uncertainty                                                       |

Format/destination-qualified Library keys prevent native/historical or public/private collisions. Meaning matching hydrates original records and changes no evidence or intrinsic scores. Automatic private-saving receipts retain item-level admission/exclusion reasons. No-save memory mode bypasses private persistence.

Answer-first runs add an `answerReceipt` with exact narrative SHA256, observation time, unassessed state, Unknown confidence and requested/served model provenance (unknown stays null). A separate assessment run may carry `assessmentOf` and `assessmentTargets`; capture targets must belong to the original answer's retained citation references. Targets record an attempted check, not verified success, and the workbench can reopen the original answer. `answer:private:<runId>` Library records index complete answer text locally and reopen immutable runs or legacy query imports without migrating them. Public projections exclude these records. Remote meaning-match metadata excludes their narrative text. Temporary-run cleanup preserves answer receipts and their linked assessments, including negative or incomplete checks; complete-answer discussion has an explicit bounded selection and reports omitted whole records.

Project source basis, editable context and decisions are distinct from entity evidence. History retains each context before edit, refresh or disconnect, up to 64 entries per project; a full history rejects further changes rather than dropping context. Context imports retain original objects/digests without inferred admission. Context v3 requests preserve namespaced opportunity IDs and enforce separate text/count/byte limits; omitted references remain local and are counted.

Batch plans freeze compatible acquisition scopes; each interest retains separate assessment. Interrupted running questions become uncertain rather than being automatically repeated. Source access failure preserves the last successful material. Source health counts acquisition scans separately from result exposures; missing historical provenance does not create feedback credit.

There are no SQL tables, ORM mirrors, database destinations or database-history commands.
Useful retired exports and implementation receipts belong in private planning archives,
with original paths and verified hashes for recovery. Public historical records still
use their declared decoding and assessment policies. [Product intent](../product.yaml)
and [AI authoring context](../../.meta/context/README.md) describe the project rather than public evidence.
