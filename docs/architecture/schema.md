# Data map

| Data             | Authority and shape                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------------------- |
| Public finding   | `signals/<type>/*.json`: closed recordVersion1 wrapper around frozen evidence schema1 and review               |
| Evidence         | Need, original sources/observations, material claims, options and limits; precise local ID bindings            |
| Signal review    | signal-review-v1, exact evidence digest, separate research/review runs, all option ratings/reasons/blockers    |
| Freshness        | Per-claim stable/volatile/unknown basis; a changing claim names its review cadence                             |
| Public index     | Derived typed options sharing CLI/browser IDs, source bindings, review inputs and calculated signal strength   |
| Private query    | Generated question/result snapshot under `.signals/queries/`; users supply normal questions                    |
| Historical state | Private `.signals/retained/` JSONL tables, immutable IDs/policies/values, complete column/count/hash manifests |
| Concept catalog  | `concepts.json`: 134 retained Signals definitions/IDs; evaluation input, not a universal ontology              |

There are no active SQL tables, migrations, ORM mirrors or database destinations. Historical
schema/constraint archives and commits are preserved privately for retention verification.
Existing evidence-bundle schema1 stays frozen; source hashes and exact encodings retain consumer
pins. New corrections create successor identities. Withdrawn originals keep their bytes.

Automatic admission requires min(relevance,evidence,usefulness,clarity)*25 >=75, no fatal blocker,
current reviewed material claims and exact public-field/source/identity validation. These ordinal
judgments are not probability. The model generates review metadata; users never author receipts.
