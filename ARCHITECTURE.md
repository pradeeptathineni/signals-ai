# Architecture

Signals has two useful entry points: browse admitted knowledge immediately, or research a new
public need with an explicitly available model/agent. Both produce source-bound options.
Private project choices remain local. Cataloged software is data, never execution authority.

## Public and local ownership

The curated public collection is held in Git. Its admission manifest selects reviewed frozen
evidence-bundle-v1 files and records each claim's review basis. The loader validates public fields,
exact bytes, sources, IDs, paths and reviews. Browser and CLI use one pure literal-filter function.
Generated indexes are disposable; complete snapshots are selected atomically before the Pages
build copies them. The public site contains no private service configuration or workspace data.

PostgreSQL owns the larger independently acquired local Corpus, private projects/queries/decisions
and operational research. Imported curated bundles are local projections of their exact source
pin. There are no independently editable Git and database masters for the same curated record.
[ADR-006](docs/architecture/ADR-006-public-corpus.md) defines promotion, retraction and alternatives.

The local database keeps three boundaries:

- `catalog`: shareable admitted identities, documents, sources, evidence and revisions;
- `workspace`: private queries, project context, shortlists, choices and lifecycle state;
- `ops`: untrusted drafts/leads, adapters, jobs, research attempts and validation history.

Public records never depend on private workspace content. Acquiring a lead does not admit it.
Corrections append revisions/successors; applied migrations and old immutable bytes stay intact.

## Exact mechanisms and judgment

Deterministic code owns identity, schemas, exact filters, source bindings, disclosure policy,
allowed network destinations, budgets, deadlines, writes, transactions and replay. Text matching
is explicitly lexical. No query vocabulary dictionary is added to impersonate open-world judgment.

A research model or the user's host agent understands the need, identifies gaps, refines questions,
organizes alternatives and explains applicability. Its proposals are untrusted. The application
host validates source authority, limits and every evidence reference before accepting a result.
A literal match, valid citation ID or provenance hash does not establish human relevance or truth.

The configured application path uses one explicitly enabled loopback OpenAI-compatible model.
The host-agent path acquires and reviews evidence through the existing interchange. They are
separate modes. Neither uses silent cloud fallback, arbitrary crawling or candidate execution.

## Maintained workflow

```text
reviewed public files -> validation -> shared filter -> browser / structured results
                                              -> exact evidence download

public need -> host agent OR configured bounded research
            -> attributed source/claim/option draft
            -> explicit source/privacy review -> admission
            -> local Corpus -> export -> consumer selection -> scoped outcome
```

Corpus indexed search does not create research work. Optional model organization is a separate
action, bound to the active query so late results cannot overwrite a newer need.

The persisted `research-skill-v1` contract has plan, one bounded refinement and synthesis outputs.
Search uses explicitly enabled adapters; Corpus research uses only admitted indexed knowledge.
Sufficient `research-protocol-v2` synthesis needs item and summary citations. Insufficient work
abstains. Historical protocol-v1 output is read at a narrow presentation boundary; queued old work
is rejected without new source/model calls. Worker leases and parent-row locking preserve recovery
and prevent late child writes from extending terminal history.

## Evidence and advice

Keep relevance, source support, intrinsic properties and private project fit separate.
The public preview displays claims, reasons, limits and review inputs without numeric estimates.
Stable claim semantics, volatile availability and unknown observations have different review
bases. Export time never refreshes an observation. Downloaded public indexes are validated and
freshness is recomputed at browser visit time.

Local historical query/intrinsic/fit policies retain their versions for replay. Their numeric
outputs are estimates, not calibrated probabilities; optional ranking details preserve inspection
without requiring a human to interpret them before finding sources.

Evidence-bundle schema v1 remains frozen independently of software maturity. Explicit review
creates public source bindings atomically. Export preserves exact bytes, refresh creates successors,
and feedback binds an exact candidate/bundle/task. Advice does not grant installation, runtime or
deployment permission. [The product contract](docs/signals-contract.md) owns current operations;
[the schema map](docs/architecture/schema.md) owns persisted compatibility details.

## Code owners

| Path                | Responsibility                                                            |
| ------------------- | ------------------------------------------------------------------------- |
| `apps/corpus`       | Public browser, comparison and downloads                                  |
| `apps/web`          | Local indexed search, research, private workspaces and evidence authoring |
| `apps/api`          | Loopback Fastify boundary, schemas, origin/host checks and safe errors    |
| `apps/worker`       | Bounded adapters, one retry owner, recovery and outbox                    |
| `packages/domain`   | Pure identity, privacy, protocols and shared public filters               |
| `packages/scoring`  | Versioned local advice and historical scoring                             |
| `packages/db`       | Forward SQL migrations, Drizzle mirror and explicit repositories          |
| `packages/seed`     | Reviewed offline records, public loader and derived export                |
| `packages/adapters` | Bounded source/model integrations                                         |

[ADR-004](docs/architecture/ADR-004-model-led-research.md) and
[ADR-005](docs/architecture/ADR-005-signals-evidence-v1.md) retain protocol/exchange decisions.
Earlier ADRs describe supported historical records, not the current product navigation.
