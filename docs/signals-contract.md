# Signals AI 1.x supported contract

Signals owns evidence acquisition, interpretation, query/selection policy, source and claim history,
project context and human-directed decisions. Context AI owns vocabulary, capability decisions,
loadouts and composition. Neither evidence admission nor a recommendation grants execution authority.

## Modes and source setup

- `model-led`: an explicitly configured loopback structured-output model runs the existing bounded
  `research-protocol-v2`. Source adapters must be enabled; no hosted fallback or model download.
- `agent-assisted`: the participating research agent acquires public sources, submits an untrusted
  draft and explicitly reviews it. It does not claim the application's model acquired the evidence.
- `offline-curated`: a maintained evidence collection assembled without a live run.
- `fixture`: synthetic regression data; rejected by real admission and export.

Offline Corpus and deterministic indexed retrieval require no external accounts, keys or models.
Workspace configures sources and local semantic assistance. States distinguish disabled, not
configured, unsupported, denied by budget, empty, partial, failed and stale. Optional-source failure
does not erase supported findings. An unsupported core question abstains. The local index is bounded
knowledge, not universal coverage. Research interpretation remains model-led or explicitly agent-assisted;
the deterministic fallback does not claim semantic research.

## Evidence, readiness and export

Search and Corpus share the research protocol while retaining different evidence universes. Raw
leads remain outside Corpus. Exchange accepts schema-v1 drafts after SHA-256 validation of exact
serialized UTF-8 bytes, then checks unique IDs, references, bounded records, safe public URLs,
supported claim bindings, modes and recognizable privacy violations. A digest proves integrity,
not source truth or author identity. Source support and rights still require explicit review.

Schema v1 is frozen independently of software version. Each claim cites source IDs; source revision,
observation date and lineage remain distinct from producer time. Unknown dates remain unknown;
readiness treats dates beyond its 90-day review window as stale uncertainty. Consumer concept IDs
are optional bounded input. No fixed dictionary constrains unseen research needs; consumers may
validate their supplied vocabulary. Namespaced extensions are inert metadata, never policy authority.

`adoption-readiness-v1` separates purpose, supported claims, documented interface, bounded check,
compatibility, redistribution, authority and unknowns. Its categorical advice is reference, trial,
adopt, defer or reject. Safe compatible interfaces with declared bounded checks may warrant a trial;
adoption also requires useful recorded feedback for that exact candidate/revision. Production and
comparative superiority need action-specific evidence. Hard blockers override preference. Popularity
is not a cutoff or confidence probability. Historical numeric relevance/value/project-fit policies
retain their own versions and meanings.

Browser review records the user's declared review; CLI review records `agent-reviewed`. Neither is
independent endorsement. Admission creates durable Corpus documents with source provenance. Export
returns stored bytes and sidecar digest unchanged. Consumers validate before changing their own
configuration. Feedback binds the exact bundle, candidate and task; it is local observed evidence.
Failed/regressed outcomes request reconsideration and never automatically install an alternative.

## Local operations

```bash
npm run evidence -- validate evidence.json
npm run evidence -- import evidence.json
npm run evidence -- project COMPLETED_RUN_ID
npm run evidence -- review DRAFT_ID 'Source support and scope checked.'
npm run evidence -- review NEW_DRAFT_ID 'Changed source interface.' PREDECESSOR_BUNDLE_ID
npm run evidence -- export ADMITTED_BUNDLE_ID output.json
npm run evidence -- feedback ADMITTED_BUNDLE_ID feedback.json
```

Validation reads `evidence.json.sha256` without a database. Other operations use the exact
`DATABASE_URL`. A model-led draft must be projected from a stored completed current-protocol run;
agent imports cannot assert that the application ran its model. Export refuses file overwrite.
Feedback input contains `candidateId`, `consumerTask`, `outcome` (`useful`, `failed`, `regressed`,
`not_used`), `detail` and a bounded `idempotencyKey`. Different input under the same key conflicts.
The HTTP API exposes the same typed operations through its OpenAPI documentation.

Reassessment clones a draft for explicit source recheck and editing. It preserves observation dates
until real new observations are recorded. Admission appends a successor and Corpus revisions.
Material need/claim/recommendation/source revision changes explain what consumers may reconsider.
A timestamp-only recheck records unchanged material claims, rather than pretending a decision changed.
Old bytes and historical replay remain intact. Refresh is manual; no always-on autonomous service is required.

## Configuration, storage and upgrade compatibility

New configuration uses `SIGNALS_*`; legacy `MAESTRO_*` aliases remain accepted in 1.x. Equal values
under both names are accepted; conflicting values fail startup. `DATABASE_URL` and
`TEST_DATABASE_URL` retain their names. New mutation clients send `x-signals-request: 1`; legacy
`x-maestro-request: 1` remains accepted. Loopback binds/origins, JSON validation, CSP and rate limits
remain enforced. Storage defaults and applied historical migrations retain their original names.

Back up retained data before upgrading. Use `npm ci`, inspect the exact destination, run
`npm run db:migrate` and `npm run build`. Forward migrations preserve old records and receipt hashes.
Do not rename retained volumes or aim integration/e2e/verify at them. The complete gate initializes
the development URL and drops/rebuilds test schemas; use explicitly named disposable databases on
a non-default port. See README for the safe verification invocation.

`catalog` is shareable, `workspace` private and `ops` operational. Public exports omit project fields;
recognizable paths and credentials are rejected. These bounded guards plus review cannot guarantee
arbitrary prose is free of sensitive information. Keep private content out of drafts. No arbitrary
crawling, cloud/model gateway, general runtime, sandbox, hosted tenancy or candidate execution is shipped.

Stable software contracts do not imply infallible inference, calibrated confidence, broad research
superiority, configured-live model proof, independent evaluation or field performance measurements.
