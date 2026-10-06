# Data map

| Data            | Authority and shape                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Native entity   | signals/entities/entity-<URI hash>.json, closed recordVersion2 wrapper with user-saved or eligible-saved state                              |
| Identity        | Canonical URI and aliases; kind/query/name independent ID; conservative GitHub repository identity only for repository roots                |
| Evidence        | Source URI/publisher/family/origin, original publication date, fetch time, raw digest, acquisition state and short matched excerpts         |
| Observation     | Model statement/indicator/status/independence, evidence ID, quote, span flag, model derivation, basis ID and judgment successors            |
| Assessment      | signal-strength-v5 with fixed kind profile and bounded numeric attention; v0–v4 replay, explicit asOf, features/bindings and nullable score |
| Query result    | schemaVersion2 run ID/question, entity items with separate relevance, source-family coverage, gaps, budgets, usage and counts               |
| Legacy finding  | signals/<type>/*.json, recordVersion1 frozen schema1 evidence and original signal-review-v1                                                 |
| Exchange        | Frozen evidence schema1, original source dates; native strength and fetch dates in separate extensions                                      |
| Generated views | Public native entities.json plus existing typed legacy Corpus/index/downloads; disposable Pages assets                                      |
| Private state   | .signals/settings.json, runs, queries, discovery-state, leases/locks/dismissals and retained immutable snapshots                            |
| Concepts        | concepts.json retains 134 Signals definitions; config/context-concepts.json snapshots all 140 Context concept definitions for research      |

There are no active SQL tables, ORM mirrors or database destinations. Native entity schemas reject unknown fields, private bytes, invalid URI/evidence IDs, unbound/forged spans, score tampering and cyclic judgment supersession. New observations use identityVersion2 to bind the claim wording as well as its quote and judgment; a corrected claim creates a successor. Unmarked historical observations retain their original identity decoder. Scores replay from accepted model observations and explicit time; they are not factual proof. Per-entity writes are atomic, with a serialized cooperating writer. Historical evidence/downloads and retained snapshots keep their original bytes and policy meanings.
