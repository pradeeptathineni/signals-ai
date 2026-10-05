# Signals AI

Signals helps people and machines find, understand and compare useful knowledge with sources.
Git is the database. Pages is the human view. A separate model review admits only findings whose
relevance, evidence, useful next action and scope are strong.

This is pre-1 software. The premature v1.0.0 release/tag was withdrawn; its commit and history
remain preserved. Development continues through tested 0.x milestones.

## Browse and search

Open the [public Corpus](https://pradeeptathineni.github.io/signals-ai/). Search keywords, combine
type/domain/tag/source filters, compare two options and inspect claims and limits. Downloads are
optional; no account, model configuration or manual evidence artifact is needed to browse.

```sh
npm ci
npm run dev
```

Open [the local view](http://127.0.0.1:5178/signals-ai/). It reads the same collection. Save an
ordinary question locally from the browser; private questions never become public knowledge just
because they were saved. PostgreSQL, Docker, workers and a separate API are not needed or supported.

Choose every-keyword matching for precise inspection or ranked word matches for broader questions.
Word ranking suggests candidates; a research agent interprets the need, checks omissions and
acquires primary sources. Use the included Signals research skill with your existing agent, or
inspect the same structured Corpus through the CLI:

```sh
npm run corpus -- search '--query=water meter' --domain=Household
npm run corpus -- search '--query=How can I recover verbose test output?' --textMode=ranked
npm run research -- query 'How can I detect a plumbing leak without buying equipment?'
npm run research -- context 'Which maintained approach ranks repository code for my task?'
```

The optional configured model path requires an explicitly chosen loopback structured-output
endpoint and model. Set `SIGNALS_MODEL_ENDPOINT` to its HTTP chat-completions endpoint on
`127.0.0.1` or `::1`, including a port, and `SIGNALS_MODEL_ID` to its model ID. Then append
`--model` to a research query. Two bounded calls organize and separately review the answer.
A failed or invalid model leaves ranked candidates and exact match IDs available and reports the gap. Nothing
extracts credentials, downloads models or falls back to a hosted provider.

## One record, one authority

[signals/](signals/README.md) contains `signals/<type>/<finding>.json`. A finding owns its need,
tags, sources, claims, alternatives, limits and review. Domains are metadata. JSON indexes,
evidence downloads and Pages are derived views, without sibling editable masters.

An agent saves public findings only after source checks and a separate high-signal review.
The weakest of four ordinal assessments determines admission: all must be strong. A score of
75 means that policy was satisfied; it is not a 75% chance of correctness or benefit. Relevance
is assessed against the record's original need, then reconsidered for a consumer's question.
Unknowns, changing source facts and unsupported comparative claims remain explicit.

Local questions and historical data live privately under ignored `.signals/`. The development
server denies serving those files. Retained database data was completely migrated and verified
before the project containers and volumes were removed. Historical snapshots remain accessible
as files; they do not bypass the current admission gate. See the [retirement decision](docs/architecture/ADR-009-database-retirement-and-signal-admission.md).

## Build and verify

```sh
npm run verify
npm run eval:corpus
npm run corpus:preview
```

Verification covers source/privacy/identity bindings, admission thresholds, immutable downloads,
atomic writes, rejected model answers, browser/CLI parity, responsive keyboard flows, accessibility
scans and local query saving. Concept queries come from [concepts.json](concepts.json), preserving
134 actual retained Signals definitions. The evaluation reports gaps rather than treating an
empty match as a success.

[Architecture](ARCHITECTURE.md), [the data map](docs/architecture/schema.md) and
[the product contract](docs/signals-contract.md) describe current behavior. Configured-live model
quality, human usefulness and universal research superiority remain unestablished.

The [Context selection](.context-ai/selection.json) pins development guidance. Checked-in modules
can be read directly on a clone; its installation receipt stays local. The matching Context source
can reproduce the pin in an empty consumer. Applying over materialized clone files without a local
ownership receipt correctly refuses; a moved managed installation requires checked rebind.
