# Local Signals provider

Consumers connect to an explicitly configured loopback HTTP endpoint without sibling TypeScript imports or a mandatory SDK. Start the existing workbench from its installed Signals root with `npm start`; `SIGNALS_WORKSPACE` selects the owned data root and `SIGNALS_PORT` selects its loopback port. The standalone workbench and existing API remain available.

Register the complete trusted base URL, for example `http://127.0.0.1:5178/signals-ai/__signals/api/`, and the expected owner instance/epoch. Never obtain endpoints, commands, paths or credentials from record content. Browser integrations use a same-origin host bridge to this registered endpoint. Existing origin/session checks remain; direct cross-origin browser requests are refused.

## Negotiate capabilities

`GET provider/capabilities` accepts `x-signals-provider-version: 1.0` (also the default when omitted). Other major/minor versions return `426 unsupported_provider_version`; no version substitution occurs. The response wrapper contains:

- `capabilities`: closed `OwnerCapabilities` v1, with `owner:"signals-ai"`, durable `instance_id`, installed product version, contract versions, operations, record kinds, observation time and availability/reason.
- `deduplication`: accepted S02 identity, epoch and durable request retention contract.
- `access`: relative routes and origin/session requirements, describing this endpoint rather than authorizing arbitrary discovery or execution.

Capability reads never initialize storage, probe a native CLI or start research. Available means the HTTP owner contract is available; native generation readiness remains separate. `process_observation:true` advertises K13's bounded owner snapshot. Consumers check required operations and target kinds as well as versions. Unsupported operations disable only that action, not unrelated products. K12 now advertises bounded `search_library` and exact owner reads for its supported kinds.

Identity reuses S02's durable scope. Missing/corrupt/unreadable scope yields `503 provider_unavailable`, never an invented instance or repaired ledger. For an explicitly selected fresh workspace, obtain the existing session token and explicitly `POST request-scope` with `{}`. Session acquisition includes native readiness and is separate from capability/record reads. Never initialize another scope to resolve uncertain work, storage loss or restore. Already registered callers can pin `x-signals-instance-id` and `x-signals-owner-epoch` while negotiating.

## Read exact retained records

`GET provider/records?ref=<URL-encoded JSON RecordRef>` requires:

```text
x-signals-provider-version: 1.0
x-signals-instance-id: <trusted registered instance_id>
x-signals-owner-epoch: <trusted registered epoch>
```

The closed reference has `owner`, `kind`, `id`, `revision`, `digest`. Supported owner is `signals-ai`. `answer`, `research_run` and `research_note` use UUID IDs selecting existing private `.signals/runs` snapshots; answers require a valid answer receipt, while notes require an incomplete narrative without one. `imported_answer` uses the older answer's run UUID and opens its unchanged `.signals/queries` record. `entity` IDs have `public:` or `private:` before the native entity ID, preserving duplicate visibility identities. `lead` and `project` use their existing owner IDs and open deterministic validated per-record JSON projections from their aggregate stores. Legacy published bundles have no exact per-record reader and are excluded from this provider search. Arbitrary paths/open commands and extra reference fields are unsupported. Missing data never triggers research.

The response includes bounded UTF8 JSON in `content`, `content_type:"application/json"`, `encoding:"utf8"`, owner instance/epoch, a storage label and a resolved `ref`. Runs, imports and native entities return their exact original file bytes. Lead and project records return the canonical validated per-record JSON projection. Digest is lowercase SHA256 over those returned bytes; revision is `sha256:<digest>`. Original run CRLF, Unicode, partial/failed status, narrative, dates and limits survive. The historical reader validates the snapshot, but its recalculated replay projection is not substituted for original bytes. A change during validation is refused. These reads write no records, Library selections or job state.

This follows the existing cooperative immutable-store boundary. The before/after comparison is not an atomic transaction against external editors or pathname swaps that ignore that boundary.

Null revision/digest explicitly resolves the current retained immutable snapshot. Preserve the returned complete reference to reopen that exact version. Mismatched non-null revision/digest returns `409 provider_record_changed`; no successor is substituted. Retained history is not automatically a saved Library answer. Memory-only content without a snapshot stays unavailable after restart. Successful private loopback reading grants no public/export authority; private data remains excluded from public assets.

## Search the retained Library

An answer/import may optionally carry Research's `claim-support-v1` closure.
Native runs use `grounding`; imports retain it at `result.input.grounding` in
their exact original bytes. Signals replays Research's validator on reading;
consumers display the supplied annotations without deriving support judgments.
Absence means unavailable assessment, not unsupported claims. See
[grounded answers](grounded-answers.md) for creation, retention and limits.

`GET provider/library?q=<Unicode text>&limit=<1..100>&kinds=<comma-separated kinds>&project_ref=<encoded RecordRef>&cursor=<opaque>` requires the same trusted owner headers as record reads. All filters are optional. Empty `q` returns recent saved records; default limit is 30, maximum 100. Supported kind filters are `answer`, `research_note`, `imported_answer`, `entity` and `lead`. A project filter must name a current Signals `project` ref; stale project digest/revision is refused. Unknown or repeated filters fail explicitly. Search reuses the owner Library's phrase, prefix and typo index; retrieval rank never becomes evidence strength.

The K12 v1 page contains `records`, `next_cursor` and `owner_coverage`. Each summary contains an owner-qualified exact ref, title, bounded description, kind, associated project refs, visibility, qualification, observation time and `open_capability`. A missing or invalid original appears as `unavailable`, never regenerated content. The cursor binds the filters and current result snapshot; a changed or malformed cursor returns `409` for a fresh first-page search. A corrupt run can reduce answer coverage while valid unrelated stores remain searchable; `owner_coverage.reason` reports that gap. These aggregate summaries include no private answer text or personal notes. Unsaving removes an item from aggregate selection without deleting its original history or its previously issued exact ref.

Missing owner bindings return `428 provider_owner_binding_required`. Wrong instance/epoch/reference owner returns `409`. Missing snapshots return `404 provider_record_not_found`. Malformed references/extra query fields return `400`. Unsafe, oversized, corrupt or unsupported snapshots return `503 provider_record_unavailable`. Errors provide bounded `code` and actionable `reason` without private paths. Unavailable transport never causes inference fallback or automatic owner rebinding.

## Existing actions and recovery

Advertised `search`, `cancel`, `lookup_request` and `request_configuration` use the existing API; capabilities do not grant execution authority. Mutations retain loopback Host, same-Origin/cross-site protection and random `x-signals-token`. The exact pre-effect `403 csrf_token_required` and cross-origin `403 untrusted_origin` remain unchanged.

Supplied provider-version and instance headers also bind existing actions: an incompatible version or wrong configured instance/epoch is refused before body parsing or effects. Legacy callers that omit these optional headers retain existing behavior. These checks follow the existing origin and CSRF refusals, preserving their exact pre-effect responses.

Follow the [durable request contract](signals-contract.md#durable-research-requests-v1): persist original key/envelope, owner epoch and `signals-execution-v1` configuration reference before send; pin `x-signals-execution-digest`. Negotiating capabilities must not recompute uncertain requests from current defaults. Recover through authoritative `requests/{key}` with its original scope/configuration. Neither a not-found nor a capability response authorizes replay. Actual Deep connection is qualified separately; this adds no controller, scheduler or mandatory service.

## Ask about saved research

`ask_saved_research` discusses one exact retained `answer` or `research_note` without new search. `POST followups` takes the closed [frozen-followup-request-v1](signals-contract.md#frozen-follow-up-requests-v1) envelope with the session token and `x-signals-owner-epoch`. It answers `202` with the durable receipt before any discussion finishes. `GET followups/{key}` (`lookup_followup`) reads that receipt back and adds `result_ref`, the exact retained child `answer`, once it exists. Read the child through `provider/records`; it is an ordinary unassessed private answer that Library search and exact planning references can select. Imported answers and other kinds are not accepted as parents.

A changed, missing, unsafe or wrong-kind parent is refused with the record-read codes above before any identity is admitted or model called. `409 runner_busy` admits nothing. The same key returns its original receipt without rechecking the parent or discussing again; changed meaning is `409 request_conflict`. An `unknown` receipt stays unknown after restart and is never replayed. `cancel/{job}` uses the receipt's `run_ref`. Ledger rows appear in `provider/processes` like other durable requests. Lookups take no writer lock, so a `503` read while the owner publishes a ledger update can clear on the next read of the same key; it never means the request is absent.

## Observe current research work

`GET provider/processes` returns one complete K13 v1 snapshot of known durable requests and in-process jobs. Pin the trusted provider version, instance ID and durable request epoch in the same headers used for record reads. `store_epoch` is an independent observation epoch; it changes when the HTTP owner restarts without retiring the durable request epoch. `sequence` changes with observed owner state, while repeated reads alone leave it unchanged. `snapshot_revision` combines the observation epoch and sequence. This v1 response has `cursor:null`, `event_cursor:null`, `full_snapshot:true` and `complete_coverage:true`; it refuses an over-2 MB response instead of truncating it. There is no public delta or pagination transport.

Rows identify exact job IDs and, for durable requests, the original request identity. Progress carries the last worker event and its time. Snapshot `as_of` is the read time and does not refresh a worker heartbeat. Unknown query scope, model and cost stay unknown. A live in-memory result can be reopened with the existing `runs/{job-id}` route; after restart, a durable receipt can remain complete or partial while its memory-only answer is unavailable. An unresolved receipt after restart is `unknown`, never proof of a live child. Direct jobs are only known in the current owner process; missing rows or a disconnected owner do not establish completion.

Each row advertises an exact `cancel` job target when a current worker can be interrupted. Cancellation intent leaves the lifecycle running until the owner confirms a terminal result. Durable rows also advertise reconciliation against the original idempotency key and owner epoch. Mutations require the existing session token and retain the pre-effect CSRF and origin checks. A consumer must preserve its last complete snapshot as stale on connection failure, reject older sequences in one observation epoch, and obtain a full snapshot when the observation epoch changes.

Copy [process-consumer.mjs](../scripts/examples/process-consumer.mjs) alone into a Node 24 directory and run it with the exact trusted endpoint, instance ID and durable request epoch. It prints a validated full snapshot without importing Signals code or invoking a model. Run `npm run build && npm run demo:processes` for the local [offline demo](../scripts/examples/process-demo.mjs). It uses the real built-asset HTTP handler with an explicitly authored callback and measures restart, stale evidence, cancellation, partial and failed work without provider calls.

## Consumer with no Signals imports

Copy [provider-consumer.mjs](../scripts/examples/provider-consumer.mjs) alone into a Node 24 directory. It uses built-in HTTP/crypto/assert support, validates the explicitly configured endpoint, refuses redirects, checks owner/version/operation availability and verifies content digest/revision:

```sh
node provider-consumer.mjs \
  http://127.0.0.1:5178/signals-ai/__signals/api/ \
  INSTANCE_UUID EPOCH_UUID \
  '{"owner":"signals-ai","kind":"answer","id":"RUN_UUID","revision":null,"digest":null}'
```

Supply actual IDs from trusted registration and selected retained history. The consumer performs no install, native readiness probe or model call. This demonstrates the provider protocol, not actual Deep integration or live research quality. The unchanged dependency audit remains a separate release gate.

Copy [library-consumer.mjs](../scripts/examples/library-consumer.mjs) alone into a Node 24 directory to search the owner and verify each returned exact read:

```sh
node library-consumer.mjs http://127.0.0.1:5178/signals-ai/__signals/api/ INSTANCE_UUID EPOCH_UUID "aurora"
```

The offline `library-built-demo.test.ts` runs an authored callback behind actual built Signals assets, restarts the HTTP owner with generation disabled, and exercises this external consumer plus standalone Library navigation. Its fixture observations are not native research-quality evidence.
