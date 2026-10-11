# Signals AI

The workspace opens on **Home**, showing retained discoveries and recent searches without a model call. Search offers **Library**, **Online** and **Combined** scopes. **Projects** connects selected repository/folder snapshots to useful findings; **Library** holds saved knowledge; **Following** keeps interests and sources together. Online research is deliberate. Public Pages searches approved public records only.

New native assessments use [ADR-017](docs/architecture/ADR-017-query-assessment-and-library.md): inspectable query interpretation, relevance anchors 0/25/50/75/100/null and type-specific `signal-strength-v7`. Query relevance orders results; intrinsic Signal never changes because of a question or save. Historical policies retain their original labels and values. Evidence opens beside results; select candidates to compare and ask about their frozen evidence.

Library returns immediate word matches. In **Settings → Personal Library**, explicitly permit one no-web meaning match on submitted queries. The disclosure names metadata sent through the existing authenticated AI host; notes and project context are excluded. Literal search remains available when matching is disabled, unavailable or cancelled. Manual saving accepts unassessed leads privately. Optional personal autosaving is disabled by default and requires completed assessment, supported relevance and the chosen Signal threshold; it never publishes records.

Search Signals turns a question into a readable opportunity brief and inspectable scored findings. Use the native `signal-search` skill in an existing AI session, or the local portal/headless CLI with one configured native session. The original answer survives malformed record metadata; valid findings can be saved and reopened. New profiles select Sol low, private saving and disabled recurrence. See [ADR-015](docs/architecture/ADR-015-native-research-replacement.md) for the replacement boundary and its limits.

Signals discovers reusable knowledge, checks source-bound observations and lets you save useful entities to a Git Corpus. Your existing AI supplies interpretation; deterministic code owns acquisition limits, evidence binding, scoring, storage and replay. This is pre-1 software. No v1.0.0 release is active or authorized.

## Use your AI

The [signal-search Agent Skill](.agents/skills/signal-search/SKILL.md) uses the invoking agent's native search and reasoning. It does not start a second AI. The agent produces intermediate JSON; you ask ordinary questions. Other Agent Skills hosts map their permitted search/fetch and helper tools to the [same protocol](.agents/skills/signal-search/references/protocol.md).

For headless research, install and authenticate Codex CLI through its supported setup. Signals checks readiness and uses its model/effort references, with optional local overrides. Queries and selected public evidence go to that CLI's configured provider. Local control does not imply local inference. Credentials never enter the browser or Corpus.

```sh
npm ci
npm run signal-search -- --capability
npm run signal-search -- --query 'Which laptop-friendly research tools preserve portable data and provenance?' --profile wide --json --save never
```

Search works without an existing Corpus. `--save never --cache memory` creates no project files; the AI host may retain its own logs. Append `--context` for frozen schema-v1 interchange or `--cache private` for local run history. Explicit `--save eligible` admits direct matches meeting the configured strength threshold. It does not commit or push.

`npm run signal-search -- --query "model context protocol" --sources-only` returns ranked GitHub, Hacker News and Wikipedia locators without inference. The local workbench exposes the same retrieval through **Find sources without AI**. These links are unassessed; research and review establish eligibility before saving. Headless native web research is the default. Public APIs supplement it only when explicitly configured; their calls share its acquisition budget. Source families and supported GitHub path scopes are enforced. Access denials and unsupported direct scopes remain gaps; there is no credential extraction or automatic retry. Rank and popularity do not establish signal strength. GitHub uses [star-sorted capability/topic and recent exploration lanes](https://docs.github.com/en/rest/search/search), Hacker News its [public search API](https://hn.algolia.com/api), and general concepts the [MediaWiki search API](https://www.mediawiki.org/wiki/API:Search). Wikipedia is a reference lead: formal status must come from the issuing authority.

## Search, review and save locally

```sh
npm run build
npm run start
```

The CLI reads the same current collection with `npm run research -- library-query 'remembered purpose'` (append `--public` for public scope). It honors the saved meaning-matching preference. `corpus-query` remains the explicit historical legacy reader. `npm run verify` includes development and production-built browser journeys; `npm run test:built` requires a current build.

Open [the workbench](http://127.0.0.1:5178/signals-ai/). Search reads the whole eligible native and historical corpus, including descriptions and captured metadata, with phrase, prefix and typo matching. Retrieval rank is separate from intrinsic evidence strength. Unknown license or price does not establish open-source or free-to-use access. Notes, save state and project decisions remain private. Research online retains readiness, bounded progress, cancellation, source gaps, comparison, frozen-evidence follow-up and manual/eligible saving. Following and Activity preserve maintenance controls while browsing remains available.

Projects reads only a selected public GitHub repository or explicit local folder, within fixed file/byte and sensitive-content boundaries. Inspect the preview and editable constraints before registering or sending context to research. Snapshots record their source basis; updating one marks earlier opportunities stale. Disconnecting access preserves saved findings and decisions. General opportunities belong to Signals. An applicable **AI setup** request is advisory input for Context, which owns equipment selection, permissions, pins, delivery and undo. See [ADR-016](docs/architecture/ADR-016-corpus-first-project-experience.md).

Supplemental website choices default to Reddit, Hacker News, Stack Overflow, GitHub and YouTube. Add HTTPS websites or narrower paths in Settings, globally or per interest; examples include `https://www.reddit.com/r/codex`, `/r/ClaudeAI`, `/r/ChatGPT` and `/r/LocalLLaMA`. Up to twenty effective scopes supplement broad search within its existing budget. Headless callers can repeat `--site URL`. Access denials remain visible. Saving also records the chosen question, interest/concept references and selected identities in a private ledger; queries never become part of a public entity's intrinsic score.

`npm run dev` provides the same local API while developing. The [public Pages Corpus](https://pradeeptathineni.github.io/signals-ai/) is a read-only generated view. It cannot start the user's AI or read `.signals/`.

## Discovery

Capture a supplied URL with `npm run signal-search -- --query 'Describe this resource and its limits' --url https://example.com/resource --save never`, or use **Capture URL** in Search. Capture is user-seeded, distinct from discovery. Native agents can include discovery trails and contextual judgments in the shared proposal.

Cards keep intrinsic evidence strength, query fit, contextual priority and automatic admission separate. Priority is a versioned ordinal policy over source-bound applicability/value, actual Corpus membership and conservative feedback; it is not probability. Reasons, constraints, use/wrap/adapt/study/watch/reject actions and linked alternatives remain inspectable. Personal novelty stays unknown until you indicate it. Evidence preview opens the supplied passage and source; a span match does not prove entailment.

Priority v2 requires active supported defining and priority-cited evidence. Ungrounded leads keep null priority; use/wrap/adapt proposals are held at study with the original action shown. They remain visible and manually saveable, but do not enter advisory recommendations. Equal scores retain stable identity ordering. Discovery labels distinguish request seeds, configured parents, matched outlinks and model reports; a candidate-named verification query does not prove unknown-name discovery. Source-family coverage is model-reported.

Private notes, skip/mute/useful feedback, followed sources and the promising inbox live under `.signals/`. Inbox retention is separate from Corpus admission. Its automatic policy is off by default and configurable in Settings. Followed feeds/pages record scan exposures and new-link opportunities, not invented usefulness. Repeated scans report unchanged content and no repeated new links. Broad research remains available alongside these sources. Source content changes remain unassessed until researched; entity refresh compares supported claims/kind/license rather than fetch timestamps.

Corpus cards identify their public or private store. Primary checks and refresh target that card's store, even when both stores contain the same identity. CLI primary checks can select `--check-primary ENTITY_ID --destination private` (or `public`); an unscoped duplicate is rejected rather than checking another copy's evidence.

Source scans fetch outside the writer lock; supplemental state failures stay visible gaps without disabling native research. Background acquisition does not count as a result exposure. New `scans` and `resultExposures` counters distinguish acquisition from links reaching results; historical exposure totals are not user engagement proof. Explicit feedback is credited once per entity to its verified configured parent, including saved results with a retained selection trail. Unknown historical provenance receives no invented credit. SearXNG supports configured public HTTPS JSON endpoints; loopback HTTP is unsupported. Optional provider failure does not trigger a paid/private-network fallback.

Optional acquisition/extraction is configured in ignored `.signals/providers.json`; Following → Sources reports configuration separately from runtime success. Settings reports native runner readiness. With no file, native research and static Readability/RSS extraction work. The closed provider schema supports selected public APIs, a public HTTPS SearXNG JSON endpoint, reviewed last30days acquisition, public-only Jina fallback, local Docling and optional funded GPT Researcher. See [provider boundaries and pins](docs/architecture/ADR-012-refreshed-acquisition-and-priority.md). Hosted readers never bypass denied/private access. Docling needs reviewed local artifacts; its bridge disables remote services/downloads and OCR. No paid API entitlement or provider fallback is assumed.

Extra grounded assessment is an explicit CLI specialist: `--review` uses another bounded no-web inference over fetched material. Ordinary research has one native task. `--save never --cache memory` preserves the no-state behavior.

Optional provider readiness distinguishes **unconfigured** from configured-but-unprobed and blocked. A SearXNG JSON endpoint may deny access or report unresponsive engines even with HTTP200; those remain gaps, without automatic retry. The pinned last30days HN wrapper can use an explicitly selected public CA bundle through `last30days.caFile` in private `.signals/providers.json`. This fixes Python installations missing a default trust store; it never disables TLS verification or imports ambient credentials. Select an absolute, regular, reviewed PEM certificate file with no private keys. A successful locator lookup is not proof of topic relevance.

Native exchange exports retain publication/fetch dates and assessments separately. Configured-live research is `model-led`; native invoking-host research is `agent-assisted`; fixture results stay fixture-labelled and cannot enter real evidence admission. Re-exporting a retained result changes its export time/code revision, not its original observations or discovery time.

```sh
npm run discovery -- setup
npm run discovery -- status
npm run discovery -- enable query
npm run discovery -- run-due --once
npm run discovery -- timer
npm run discovery -- disable both
```

One-shot query-list discovery does not enable recurrence:

```sh
npm run discovery -- setup-concepts
npm run discovery -- run-list --once --limit 3 --profile quick --model gpt-6-luna --effort low
npm run discovery -- run-list --once --resume BATCH_UUID --limit 3
```

Pass interest IDs after `--once` to select a subset. Omit them to select enabled interests. Each activation processes the configured batch size unless `--limit` explicitly changes it. Resume processes pending questions; completed, failed, cancelled and uncertain paid attempts are preserved. Settings also offers filtered one-shot activation and continuation. The checked-in Context research catalog snapshots all 140 concept names and definitions with its source digest; this research input is separate from the pinned development loadout.

Setup copies twelve editable starter interests into ignored local settings: eight pinned Context concepts and four related interests. Both discovery modes start disabled. Query discovery and saved-entity refresh share the live kernel. Due slots coalesce missed work; a durable lease prevents overlap and completed slots replay without inference. Interrupted slots require inspection rather than automatic paid repeats. The timer runs only while the local process and laptop are awake; no OS timer is registered.

Publication defaults to local-only. `npm run discovery -- publish` is an explicit reviewed Git operation. Unattended publication requires choosing that setting and a clean, verified Signals checkout. It uses ordinary commits/pushes and existing Pages CI; Git owns credentials.

## Evidence and scoring

Canonical new records are `signals/entities/*.json`. Entities have stable URI identities, kinds, facets, immutable evidence and model-derived observations. Query relevance stays outside the entity. Publication dates differ from fetch dates. A matched quote checks a text span, not factual entailment; factual support remains a fallible model judgment. Headless runs review bounded fetched text before scoring. Unknown, inaccessible and ambiguous candidates stay visible.

The current `signal-strength-v6` index uses `25C + 20A + 20M + 15F + 10H + 10V - risk` for ordinary entities: corroboration, adoption, maturity, currentness, authority and verification. Source-bound numeric popularity uses fixed capped logarithmic anchors; stars and other attention counters earn at most five points. Independent mentions earn corroboration credit, while stronger adoption needs independent use. Repeated publishers/mirrors cannot create extra support. Unknown features earn zero. See the [exact policy and anchors](docs/signals-contract.md).

Formal standards use the declared profile `10C + 15M + 25F + 40H + 10V - risk`, with adoption not applicable. Inspected governing authority and current formal status matter more than popularity for this kind. An old publication can remain valid, but a mutable catalogue-status check expires after 365 days: freshness falls and current-status authority drops to recognized authority until reviewed. A name saying “standard” earns no authority by itself. Threshold 75 remains an initial ordinal policy, not a probability or proven benefit. The original v0 weights and snapshot semantics remain available for historical replay. Manual saves support useful niche resources with limited public evidence.

Legacy `signals/<type>/*.json` findings retain their original all-strong review policy and exact schema-v1 downloads. They are not relabelled with the new policy. Corrections retain historical evidence and append successor judgments. Private queries, schedules, caches and retained snapshots remain under ignored `.signals/`, denied by local/static servers. Database services and candidate execution are retired.

## Verify and inspect

```sh
npm run verify
npm run corpus -- search '--query=water meter' --domain=Household
npm run research -- corpus-query 'How can I recover verbose test output?'
npm run eval:corpus
```

Verification uses isolated deterministic/browser fixtures and needs no model service. Live studies, configured runner behavior, independent review and human usefulness are distinct evidence classes. See [architecture](ARCHITECTURE.md), [data map](docs/architecture/schema.md), [product contract](docs/signals-contract.md) and [ADR-011](docs/architecture/ADR-011-live-signal-search.md). Development guidance remains pinned in [.context-ai/lock.json](.context-ai/lock.json).
