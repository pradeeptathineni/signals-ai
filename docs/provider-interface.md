# Local Signals provider

Consumers connect to an explicitly configured loopback HTTP endpoint without sibling TypeScript imports or a mandatory SDK. Start the existing workbench from its installed Signals root with `npm start`; `SIGNALS_WORKSPACE` selects the owned data root and `SIGNALS_PORT` selects its loopback port. The standalone workbench and existing API remain available.

Register the complete trusted base URL, for example `http://127.0.0.1:5178/signals-ai/__signals/api/`, and the expected owner instance/epoch. Never obtain endpoints, commands, paths or credentials from record content. Browser integrations use a same-origin host bridge to this registered endpoint. Existing origin/session checks remain; direct cross-origin browser requests are refused.

## Negotiate capabilities

`GET provider/capabilities` accepts `x-signals-provider-version: 1.0` (also the default when omitted). Other major/minor versions return `426 unsupported_provider_version`; no version substitution occurs. The response wrapper contains:

- `capabilities`: closed `OwnerCapabilities` v1, with `owner:"signals-ai"`, durable `instance_id`, installed product version, contract versions, operations, record kinds, observation time and availability/reason.
- `deduplication`: accepted S02 identity, epoch and durable request retention contract.
- `access`: relative routes and origin/session requirements, describing this endpoint rather than authorizing arbitrary discovery or execution.

Capability reads never initialize storage, probe a native CLI or start research. Available means the HTTP owner contract is available; native generation readiness remains separate. `process_observation:true` advertises K13's bounded owner snapshot. Consumers check required operations and target kinds as well as versions. Unsupported operations disable only that action, not unrelated products. K01/K12 support here is bounded to exact retained-run references; aggregate Library search and summary pagination are not advertised.

Identity reuses S02's durable scope. Missing/corrupt/unreadable scope yields `503 provider_unavailable`, never an invented instance or repaired ledger. For an explicitly selected fresh workspace, obtain the existing session token and explicitly `POST request-scope` with `{}`. Session acquisition includes native readiness and is separate from capability/record reads. Never initialize another scope to resolve uncertain work, storage loss or restore. Already registered callers can pin `x-signals-instance-id` and `x-signals-owner-epoch` while negotiating.

## Read exact retained records

`GET provider/records?ref=<URL-encoded JSON RecordRef>` requires:

```text
x-signals-provider-version: 1.0
x-signals-instance-id: <trusted registered instance_id>
x-signals-owner-epoch: <trusted registered epoch>
```

The closed reference has `owner`, `kind`, `id`, `revision`, `digest`. Supported owner is `signals-ai`; kinds are `answer` and `research_run`; IDs are UUIDs selecting existing private `.signals/runs` snapshots. Answers additionally require a valid answer receipt. Arbitrary paths/open commands, extra fields, entity records, legacy query-import projections and other formats are unsupported on this boundary. Existing Library routes retain their behavior. Missing data never triggers research.

The response includes exact original UTF8 JSON in `content`, `content_type:"application/json"`, `encoding:"utf8"`, owner instance/epoch, `storage:"retained_run_snapshot"` and a resolved `ref`. Digest is lowercase SHA256 over the original bytes; revision is `sha256:<digest>`. Original CRLF, Unicode, partial/failed status, narrative, dates and limits survive. The historical reader validates the snapshot, but its recalculated replay projection is not substituted for original bytes. A change during validation is refused. These reads write no records, Library selections or job state.

This follows the existing cooperative immutable-store boundary. The before/after comparison is not an atomic transaction against external editors or pathname swaps that ignore that boundary.

Null revision/digest explicitly resolves the current retained immutable snapshot. Preserve the returned complete reference to reopen that exact version. Mismatched non-null revision/digest returns `409 provider_record_changed`; no successor is substituted. Retained history is not automatically a saved Library answer. Memory-only content without a snapshot stays unavailable after restart. Successful private loopback reading grants no public/export authority; private data remains excluded from public assets.

Missing owner bindings return `428 provider_owner_binding_required`. Wrong instance/epoch/reference owner returns `409`. Missing snapshots return `404 provider_record_not_found`. Malformed references/extra query fields return `400`. Unsafe, oversized, corrupt or unsupported snapshots return `503 provider_record_unavailable`. Errors provide bounded `code` and actionable `reason` without private paths. Unavailable transport never causes inference fallback or automatic owner rebinding.

## Existing actions and recovery

Advertised `search`, `cancel`, `lookup_request` and `request_configuration` use the existing API; capabilities do not grant execution authority. Mutations retain loopback Host, same-Origin/cross-site protection and random `x-signals-token`. The exact pre-effect `403 csrf_token_required` and cross-origin `403 untrusted_origin` remain unchanged.

Supplied provider-version and instance headers also bind existing actions: an incompatible version or wrong configured instance/epoch is refused before body parsing or effects. Legacy callers that omit these optional headers retain existing behavior. These checks follow the existing origin and CSRF refusals, preserving their exact pre-effect responses.

Follow the [durable request contract](signals-contract.md#durable-research-requests-v1): persist original key/envelope, owner epoch and `signals-execution-v1` configuration reference before send; pin `x-signals-execution-digest`. Negotiating capabilities must not recompute uncertain requests from current defaults. Recover through authoritative `requests/{key}` with its original scope/configuration. Neither a not-found nor a capability response authorizes replay. Actual Deep connection is qualified separately; this adds no controller, scheduler or mandatory service.

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
