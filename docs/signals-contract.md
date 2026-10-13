# Assessment and evidence contract

A finding has intrinsic evidence strength. A question has relevance. Contextual priority suggests a next action. Retrieval rank locates retained knowledge. None establishes personal novelty, usefulness or permission to execute a candidate.

## Assessment confidence and generalization

These meanings stay separate:

| Meaning                  | What it describes                                                                               | What it does not establish                          |
| ------------------------ | ----------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Query relevance          | Fit to the interpreted need and inspected required constraints                                  | Intrinsic quality or personal usefulness            |
| Intrinsic Signal         | Source-bound evidence strength under a declared type rubric and policy                          | A probability that a claim or assessment is correct |
| Evidence sufficiency     | Whether enough support was inspected for a completed or provisional assessment under the policy | Measured assessment accuracy                        |
| Confidence in assessment | Reliability of the assessment itself                                                            | A value obtained by dividing Signal by 100          |

The current policies have no empirical probability calibration. Assessment confidence remains unknown. Source binding and deterministic invariants establish behavior under their test conditions; a matched passage does not establish entailment, independence or measured assessment accuracy. Decisive unsupported evidence must still cause abstention through the policy's null score and next-verification rules.

Type rubrics and cross-type fixtures test policy behavior, not semantic generalization. Broad quality claims require independent claim/outcome checks over diverse unseen needs, including failures and abstentions. Retention, rediscovery, source counts and provider token usage do not supply that evidence. Historical confidence/fit labels keep their original scope and do not become calibrated assessment confidence.

## Native assessment

Active native brief v7 uses `signal-strength-v10`. The model selects a suitable type rubric and binds each proposed dimension level to observations. Code validates those bindings, applies evidence ceilings and computes the score. Historical brief v5 selects v8 and v6 selects v9, with their original arithmetic.

| Dimension                   | Ordinary resources | Formal standards |
| --------------------------- | -----------------: | ---------------: |
| Claim and identity basis    |                 25 |               40 |
| Inspectable supporting work |                 25 |               20 |
| External scrutiny           |                 25 |               10 |
| Applicability and limits    |                 25 |               30 |

Each dimension has an ordinal level 0–4 or null. Contribution is weight × supported level ÷ 4; sum unrounded contributions and round once, halves upward. Unknown dimensions earn no credit and remain unknown. A score is an initial policy judgment, not calibrated probability or universal comparability across types.

Type rubrics cover software, scientific resources, news, discussion, learning, practices, standards and other resources. Software must use the software rubric; models/datasets use the scientific rubric; standards use the standard rubric. Reasons explain the selected rubric and suitable evidence.

Proposed levels are ceilings rather than automatic credit. Inspectable material supports at most level 1, worked examples 2, independent applied evidence 3 and independent replication 4. Maturity and attributable use have their own fixed ceilings. Identity/status authority distinguishes secondary accounts, primary authority, recognized authority and formal current status. Standards require inspected issuer authority and current official normative status.

Ordinary applicability may use explicitly bound verification/inspectable evidence at level 1: documented prerequisites, licence/access conditions and version scope. The model must establish applicability to the resource's own advertised scope. Query, model/provider and project suitability belong to relevance unless evidence concerns the resource itself. Inspectability cannot establish independent scrutiny or normative status.

External scrutiny in v10 requires a native-reviewed originating effort and relationship, with a short exact attribution passage and inspection reason bound to retained source evidence. Passages need at least eight characters after whitespace normalization and inspection reasons must remain nonempty after trimming; empty substring matches earn no credit. This remains a fallible native interpretation. Host is acquisition location; publisher may be a venue. Neither establishes who performed an investigation. Unbound, unmatched or unknown attribution earns no origin-dependent credit and leaves scrutiny unknown/provisional. If decisive work relies solely on unsupported replication/independent-application labels, abstain; do not manufacture a worked example. Separate explicit worked examples retain their own limited credit.

Equal known raw acquired-payload digests exclude extra support, including external-labeled copies of primary material. Null digests and equal short quotes do not establish payload equality. All locators and records remain retained; duplicate material is counted once without inferring creators. Grouping covers the effective active source set, including excerpt projections of the same selected physical payload. Missing group identity cannot earn independent credit. Native-reviewed effort identities and duplicate material jointly prevent copied or syndicated reports from minting additional support. Different raw digests do not prove distinct investigations. Shared venues or publishers do not suppress separately inspected efforts. Own-origin material, promotion and adverse findings cannot manufacture positive scrutiny. One independent support unit caps substantive scrutiny at half its weight. Software attention can earn at most five points from the strongest source-bound measurement:

`5 × min(1, log1p(count) / log1p(anchor))`

Anchors are 10,000 stars, 1,000 forks, 1,000,000 downloads, 1,000 discussion points and 10 attributable mentions. Counts must occur literally in the cited span; correlated counters are never added. Attention does not establish independent use.

Resolved identity, supported defining evidence, inspected decisive supporting work, contrary evidence and current status are required for a score. Decisive uncertainty or contradiction returns null with a reason and next verification. Explicit nondecisive gaps can produce a provisional score. Supported material/decisive failures cap work at level 1 and applicability at zero; adverse evidence earns no positive credit.

Future-dated or stale evidence earns no current credit. Evidence checks use 365 days, or 1,825 for publications/practices. Decisive stale evidence blocks assessment; retained material/decisive adverse evidence cannot silently disappear because its current status is unknown. The assessment records its explicit `asOf`, disposition, missing dimensions, reasons and next inspection.

## Query and advice

`query-relevance-v1` retains the interpreted need, required constraints, resource types and time window. Source-bound relevance uses these anchors:

| Value | Meaning                                             |
| ----: | --------------------------------------------------- |
|     0 | Conflicts with the need                             |
|    25 | Topic-only match                                    |
|    50 | Partial fit or material limits                      |
|    75 | Direct fit with a secondary limit                   |
|   100 | Direct fit with every inspected required constraint |
|  null | Unsupported                                         |

Constraint states are satisfied, conflicting or unknown. Relevance then stable identity determines relevance ordering. Correcting interpretation starts a distinct assessment and retains the prior run; it does not change intrinsic evidence.

Contextual priority v2 requires active supported defining and cited evidence. Ungrounded leads keep null priority. Proposed use/wrap/adapt actions are held at study with the original action preserved. They remain visible and manually saveable, but are excluded from advisory recommendations. Reasons, constraints, actions and alternatives remain inspectable.

Discovery trails distinguish user seeds, configured parents, matched outlinks and model reports. A candidate-named verification query cannot prove unknown-name discovery. Source-family coverage is model-reported. A source scan differs from a result exposure; explicit per-entity feedback binds once to a verified introducing configured parent. Missing historical provenance earns no inferred credit.

## Saving and retrieval

Manual personal saving accepts unassessed leads without manufacturing evidence. Optional automatic personal saving starts disabled and requires completed v7/v8/v9/v10 assessment, supported resolved identity, direct relevance at least 75 and the configured Signal threshold, initially 75. Current automatic admission also requires positive observed support for basis, work and applicability. Zero in an essential dimension cannot be compensated by high points elsewhere. This is an admission safeguard, not a weight adjustment or recalculation of historical scores. Provisional assessments and unresolved decisive evidence hold automatic admission; manual retention and visibility remain available. Per-item admission/exclusion decisions remain private. Public inclusion keeps its separate validation/review boundary; saving is not publication.

Library identities qualify format and destination to distinguish native/historical and public/private copies. Literal matching is immediate. Permitted submitted meaning matching sends only the question, qualified keys, titles, bounded descriptions, kinds, capabilities and tags. Notes, projects, source text and credentials are excluded. Initial bounds are 200 records, 48,000 serialized characters and 120 seconds. Code validates IDs/scope/filters and hydrates original evidence; omitted population and failure/cancellation remain visible. No call occurs on keystroke. Public Pages has no runner.

## Evidence and exchange

Source URI, publisher, origin, publication date, fetch/check time and digests retain distinct meanings. A matched quote establishes occurrence, not entailment. Headless assessment reads bounded fetched text; short documents are complete and long documents use literal anchors plus distributed windows within 48,000 characters. Unknown access/licence does not establish free or open-source status. Disclosed scope limits are not automatically contrary evidence.

Evidence is immutable. Excerpt digests distinguish projections over the same raw document; current evidence/checks explicitly select active snapshots without rewriting first-fetch or publication dates. New `identityVersion2` observations bind claim wording, quote and judgment. Corrections append successor judgments; changing excerpts cannot revive a retired judgment. Unmarked historical text/identity decoders retain their original semantics. Saving retained history cannot downgrade a newer receipt.

Policy v10 retains unsuperseded material/decisive adverse findings even when their source is inaccessible, inactive, stale or uncertain. Those conditions produce an unknown assessment with a specific next check; retrieval failure is not disproof. Verified contradictions bound to identity, work or applicability also hold the assessment. A verified, current, source-bound refutation or successor may resolve the same claim and scope. Changing a statement or indicator cannot erase the earlier adverse finding; unavailable or unverified successors cannot resolve it. Direct v10 refreshes retain earlier decisive bindings, so omitting a prior contradiction or uncertainty cannot restore completed status. Current admission history is also carried independently of numerical policy, including old-format imports without a typed basis. An older numerical receipt may remain 100/completed while current admission is held; the guard does not recalculate that receipt. Verified applicable failures retain the existing work/applicability caps. Current automatic admission applies these holds independently of historical numerical receipts. The writer retains decisive observation IDs on the entity projection, preserves compatible older basis metadata and never mutates the incoming result while merging. Derivation views show current holds separately when the historical numerical assessment lacks those reasons, and attribution panels display the same binding status used by scoring.

Frozen schema-v1 interchange preserves original evidence and legacy confidence/fit labels. Native strengths, fetch dates, query assessment and contextual priority use separate extensions. Query exchange binds exported source IDs against the bundle. Context recommendations retain candidate/claim IDs and exclude ungrounded advice. Private notes/feedback are never exported; advisory requests grant no activation authority.

Configured-live research is `model-led`; invoking-host research is `agent-assisted`. Fixtures remain fixture-labelled and cannot enter real evidence admission. Re-export changes export time/code revision, not original observations or discovery time. Requested frozen review may correct interpretation without hiding acquisition failures or original private receipts.

## Direct primary-source checks

A caller can explicitly request one proposition check against one or two selected fresh primary URLs without supplying a research-answer parent. The request-origin receipt preserves the question, context, proposition and source order. Existing linked checks still require the immutable original answer and selected citation membership. Both origins use the same safe acquisition, material bounds and one frozen native judgment. Acquisition failure is not contradiction, matched text is not entailment, and Unknown confidence does not become a probability. A direct verdict creates no scored entity and grants no installation or execution authority. Its private negative and incomplete outcomes remain recoverable through ordinary temporary-run cleanup. Memory mode writes no history or source cache.

## Frozen policy readers

Declared policies replay unchanged. Native brief v4 selects v7; native v1–v3 and full proposals keep their original readers. The reducers in `packages/domain/src/search-score.ts` and `search-assessment.ts` define exact arithmetic and normalizers.

| Policy               | Preserved meaning                                                                                                                                           |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `signal-strength-v0` | All unsuperseded snapshots; ordinary six-feature weights for every kind                                                                                     |
| v1                   | Explicit snapshot selection; separate standard weights and first-fetch formal-status aging                                                                  |
| v2                   | Raw-document-stable judgment bases, selected-digest excerpts and actual reacquisition checks                                                                |
| v3                   | Independent third-party credit across source families; literal text and normalization-bound grouping                                                        |
| v4                   | Source-bound numeric attention using the capped anchors above                                                                                               |
| v5                   | Future publication dates earn no dated-currentness credit; unsupported qualitative freshness is capped at half                                              |
| v6                   | Explicit current-status evidence with same-source primary-or-higher issuer authority can earn currentness within the smaller of the type window or 365 days |
| v7                   | Four bound type-rubric dimensions, decisive uncertainty and evidence ceilings; inspected verification does not supply ordinary applicability credit         |
| v8                   | The native assessment contract above, including limited inspected ordinary applicability                                                                    |
| v9                   | Initial retained adverse/contradiction holds; frozen candidate semantics at its declared code pin                                                           |
| v10                  | v9 arithmetic plus scope-preserving negative history, retained decisive bindings, inspected origin-dependent credit and duplicate-payload exclusions        |

For v0–v6, ordinary weights are corroboration 25, adoption 20, maturity 20, currentness 15, authority 10 and verification 10. Standards from v1 use 10/0/15/25/40/10. The strongest supported risk subtracts 5, 15 or 25. Unknowns earn zero without renormalization. Own-origin/mirror groups cannot create extra independent credit. Currentness windows are 90 days for software/services/other, 30 for models, 365 for datasets/learning resources/products/organizations, 730 for practices and 1,825 for publications/standards. Mutable standard-status checks expire after 365 days, capping currentness at half and formal-current authority at three-quarters until reviewed. Earlier policies retain their declared snapshot/date rules.

Historical `signal-review-v1` findings require a separately attributed model review: relevance, evidence applicability, actionable usefulness and clarity/scope each at least 3/4, with no fatal blockers or unresolved material claims. Its weakest rating × 25 is the review score. Withdrawal removes a finding from default results while preserving exact evidence/downloads. Corrected frozen findings require successor identities and review.

See the [data map](architecture/schema.md) for storage and [architecture](../ARCHITECTURE.md) for runtime boundaries.
