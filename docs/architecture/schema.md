# Data map

Active native brief v5 retains an inspectable query interpretation and separate query-relevance-v1 values. Entities can carry source-bound `signalBasis` for deterministic signal-strength-v8 replay; historical v0–v7 remain unchanged (brief v4 selects v7). `signals-ai.query-assessment` exchange version 1 uses exported source IDs, validated against the bundle rather than raw run indexes. See ADR-017 and the shared domain schemas.

Private `library-leads.json` retains unassessed URI identities and append-only saved contexts. Leads never become scored entities or public assets. `library-preferences.json` owns explicit metadata-egress permission and disabled-by-default automatic private saving. Automatic-saving receipts include per-item admission/exclusion reasons in private query history. Meaning matching hydrates original records and changes no evidence or intrinsic score.

The corpus-first workspace adds a derived `library.json` from approved public native/legacy inputs. Local retrieval additionally reads private native records and a bounded private collection annotation ledger; neither enters public assets. Project registration, source snapshots, contextual opportunities and imported Context records remain under `.signals/`. Their identifiers, source basis, decisions and evidence references are separate from intrinsic entity evidence and scores. Context migration preserves the original record object and source digest, with no inferred admission or installation authority. See ADR-016 and the closed project/library contracts.

`projects.json` owns explicit registration, current context, immutable imported source objects and
personal opportunity decisions. Private append-only project history retains each source/context
basis before edits, refresh or disconnect, up to 64 entries per project; a full history rejects the
change instead of dropping old context. `library-state.json` owns saved selection and legacy
annotations. Native annotations remain in `personal.json`. Stable format/destination-qualified
library keys prevent ambiguous native/legacy or public/private identity selection. Context v3
requests preserve namespaced opportunity IDs and enforce its separate text/count/byte limits;
omitted references remain in the original local record and are counted outside the portable request.

Native brief v3 adds the original Markdown answer before compact candidate metadata. Run snapshots retain optional `brief` and invalid `provisionalLeads`; they never turn invalid leads into entities. Legacy native v1/v2/full proposals remain ingestion-only decoders. `settings.acquisitionGroups` holds inspectable native-authored pool suggestions with per-interest opt-out; batch plans freeze compatible scopes. Per-interest final assessments remain separate. Due job receipts retain conditional primary-check results and source state retains the last successful material after access failure.

Query items add optional discovery parent/query provenance, contextual priority/actions/constraints/relationships and a delta against the saved entity. None of these fields enter the intrinsic canonical entity. `.signals/personal.json`, `inbox.json`, `source-state.json` and `providers.json` are private, schema-validated state, excluded from assets and exchange. Native schema-v1 exchange remains frozen; `signals-ai.contextual-priority` is an optional advisory extension (schema_version 1), accepting contextual-priority-v1/v2 without private notes/feedback. V2 holds ungrounded use/wrap/adapt proposals at study with null priority and preserves `proposedAction` on the query item. Such leads remain candidates but are excluded from recommendations. Discovery's optional `provenanceBasis` and `proposedIntroducedBy` distinguish deterministic binding from a model assertion. Source health adds optional `scans`, `resultExposures` and per-entity explicit `feedbackByEntity` while continuing to read historical records.

| Data            | Authority and shape                                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native entity   | signals/entities/entity-<URI hash>.json, closed recordVersion2 wrapper with user-saved or eligible-saved state                                    |
| Identity        | Canonical URI and aliases; kind/query/name independent ID; conservative GitHub repository identity only for repository roots                      |
| Evidence        | Source URI/publisher/family/origin, original publication date, fetch time, raw digest, acquisition state and short matched excerpts               |
| Observation     | Model statement/indicator/status/independence, evidence ID, quote, span flag, model derivation, basis ID and judgment successors                  |
| Assessment      | signal-strength-v8 with bound type rubrics and limited inspected applicability; v0–v7 replay, explicit asOf, features/bindings and nullable score |
| Query result    | schemaVersion2 run ID/question, entity items with separate relevance, source-family coverage, gaps, budgets, usage and counts                     |
| Legacy finding  | signals/<type>/*.json, recordVersion1 frozen schema1 evidence and original signal-review-v1                                                       |
| Exchange        | Frozen evidence schema1, original source dates; native strength and fetch dates in separate extensions                                            |
| Generated views | Public native entities.json plus existing typed legacy Corpus/index/downloads; disposable Pages assets                                            |
| Private state   | .signals/settings.json, runs, queries, discovery-state, leases/locks/dismissals and retained immutable snapshots                                  |
| Concepts        | concepts.json retains 134 Signals definitions; config/context-concepts.json snapshots all 140 Context concept definitions for research            |

There are no active SQL tables, ORM mirrors or database destinations. Native entity schemas reject unknown fields, invalid URI/evidence IDs, unbound/forged spans, score tampering and cyclic judgment supersession. Corpus admission additionally rejects private bytes. Private query history keeps source text, including credential-shaped documentation placeholders, while replay still validates structure, identity and evidence bindings. New observations use identityVersion2 to bind the claim wording as well as its quote and judgment; a corrected claim creates a successor. Unmarked historical observations retain their original identity decoder. Scores replay from accepted model observations and explicit time; they are not factual proof. Per-entity writes are atomic, with a serialized cooperating writer. Historical evidence/downloads and retained snapshots keep their original bytes and policy meanings.
