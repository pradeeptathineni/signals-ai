# Signals v1 execution ledger (historical, withdrawn)

This describes the withdrawn `c834bea242106511463d3bff934011d3a3cfa1ac` implementation.
Its receipts and screenshots remain in that Git commit. ADR-009 supersedes its runtime and
storage; current commands have no database option. See `validation-0.3.md` for current checks.

Authority: the local context-signals-v1-kit, reviewed 2026-10-05. Local checkout remains
`/Users/pradeeptathineni/code/personal/ai-systems/maestro-ai`. Do not modify Context's checkout.

Baseline: Signals repository ID `R_kgDOUr0HOg`, main `f21844f12442c2fefdcf64f737c7423245959457`.
Context startup status absent; temporary committed pin `41f19ce86251a4bde48fc1360aad8d844dc816d5`
(v0.2.0 plus four commits). Read committed standard, prior-art, patterns, research and evidence-claims.
Context status may be read once after substantial independent work and once at final integration.
No polling or waiting for Context. Existing repository context pack generated and inspected;
compression hook raw receipts were observed during tool-output recovery; packing/compression is
not a research-quality claim.

## Acceptance work

- [x] Read kit companions, root architecture/ADRs/schema, research skill, config and destructive harness.
- [x] S1 validated draft -> review/admission -> durable Corpus -> exact-byte export; real primary sources;
      publish EVIDENCE_READY with producer commit and receipt.
- [x] S2 repository identity-preserving rename, configuration aliases, disposable upgrade/clean setup.
- [x] S3 categorical adoption readiness, claim support/lineage, honest actor labels, qualified findings.
- [x] S4 refresh successors/diff, bounded consumer feedback, source/model setup, complete workflow.
- [x] S5 Context web pin, actual browser critique/revision, mobile/keyboard/reduced motion/axe.
- [x] S6 negative/regression tests, frozen implementation usefulness study, real peer importer round trip.
- [x] S7 public 1.x contract, whole-diff self-review, isolated full gate and clean checkout smoke.
      Publication follows this committed checkpoint: push/remote CI, then immutable annotated tag,
      tag CI and GitHub release. Those remote records prove publication completion.

## Safety and design

Retained `maestro-phase08-baseline-pg-20260930` on port 55488 is untouched. No `.env` exists.
Named disposable container `signals-v1-disposable-pg-20261005`, loopback port 55491,
development database `signals_v1_dev`, destructive test database `signals_v1_test`.
All DB commands receive both explicit URLs. Never change applied migration files or legacy receipt hashes.

## Completed implementation checkpoint

Public rename preserves repository node ID `R_kgDOUr0HOg`; canonical URL and origin are
`https://github.com/pradeeptathineni/signals-ai`. Local path is unchanged. Core exchange commit
`4ab32a1d7ae09ae0ebb6102b4b2d7571291c5c97` produced the first real bundle:
SHA-256 `62e5cb9a6d825a1d5194a28035640b248ee05e344bb41fd816355c1a378cb8da`.
Its actual import/admission/export receipt is under `docs/evidence/`; exact byte equality was checked.
EVIDENCE_READY was atomically published before deeper UI/readiness work.

Context bootstrap consumption and actual instruction reads are recorded in
[context-use](evidence/context-use.md). UI critique, real screenshots, accessibility/reflow and
build observations are in [web-use](evidence/web-use.md). At this checkpoint, 180 unit/property
tests and 79 PostgreSQL integration tests passed; the new mobile exchange sequence passed.
The complete release gate and clean distribution smoke were completed after that intermediate checkpoint.

## Release verification

Production review and final Context reconciliation are committed at
`ee4aea154c461aaa8f9f0cbb770240c28c19dde7`. The full isolated gate passed 181 unit/property,
79 PostgreSQL integration and 13 browser tests, alongside formatting, lint, types, exact schema,
context fidelity, structure, anti-overfit, provenance and dependency/security gates. The only audit
exception remains the previously documented exact development-only Repomix/braces path.

The fresh clone installed with `npm ci`, built, initialized a separate disposable database and
started API/worker/web. Readiness returned 200 with all 36 exact migrations and 87 seed providers;
wrong digests returned 422 and real import/review/export preserved exact bytes. Its checkout was
clean. [Clean-start receipt](evidence/clean-start.json) and [old-data upgrade proof](evidence/upgrade-check.json)
cover clean installation and preservation of old migration/provider/result identities.

The six-need [study](evidence/study/README.md), [whole-diff self-review](evidence/release-review.md),
and [actual Context round trip](evidence/consumer-roundtrip.json) are separate evidence classes.
Completed Context `a0b6a3b` owns the six selected loadouts and 199 verified installed files.
Its upstream instruction bytes are retained verbatim, including upstream whitespace, so the native
ownership hashes stay valid. Repository-owned changes pass whitespace checks.

Real consumer feedback was recorded against the original evidence/candidate. The append-only
successor adds bounded browser and consumer-reported observations; original bytes/source dates
remain unchanged. Producer `ee4aea1`, checkpoint `reviewed-successor-ee4aea1`, exact SHA-256
`6038a8a835afc68e1cc655a6a72751b52fb36365211d0e849b0faa9f753b7a95` was accepted by the actual
Context checkpoint importer with ten recommendations and no activation. The original early
checkpoint remains available. [Refresh receipt](evidence/refresh-receipt.json) preserves the chain.

Existing research protocols own model semantics; existing authoring owns Corpus documents. Frozen
peer JSON schema owns interchange; Ajv draft-2020 validation plus domain reference/privacy checks
owns admission validation. New code is the narrow exchange/review/feedback remainder. Existing
scores retain meanings; adoption readiness is a separate categorical policy. No runtime or loadout
composer is being built in Signals.
