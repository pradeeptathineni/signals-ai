# Signals AI

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

`npm run signal-search -- --query "model context protocol" --sources-only` returns ranked GitHub, Hacker News and Wikipedia locators without inference. The live runner uses these bounded public APIs before broad AI search; direct calls share its acquisition budget. Source families and supported GitHub path scopes are enforced. Access denials and unsupported direct scopes remain gaps; there is no credential extraction or automatic retry. Rank and popularity do not establish signal strength. GitHub uses [best-match ranking](https://docs.github.com/en/rest/search/search), Hacker News its [public search API](https://hn.algolia.com/api), and general concepts the [MediaWiki search API](https://www.mediawiki.org/wiki/API:Search). Wikipedia is a reference lead: formal status must come from the issuing authority.

## Search, review and save locally

```sh
npm run build
npm run start
```

Open [the workbench](http://127.0.0.1:5178/signals-ai/). Search shows readiness, bounded progress, cancellation, source gaps and typed results. Filter, compare, ask a grounded follow-up over frozen evidence, or explicitly search further. Save selected supported entities even below the automatic threshold, save eligible remaining results, dismiss candidates, or reset filters. Corpus lets you inspect and refresh saved identities. Settings controls model references, sources, retention, destination and discovery.

Supplemental website choices default to Reddit, Hacker News, Stack Overflow, GitHub and YouTube. Add HTTPS websites or narrower paths in Settings, globally or per interest; examples include `https://www.reddit.com/r/codex`, `/r/ClaudeAI`, `/r/ChatGPT` and `/r/LocalLLaMA`. Up to twenty effective scopes supplement broad search within its existing budget. Headless callers can repeat `--site URL`. Access denials remain visible. Saving also records the chosen question, interest/concept references and selected identities in a private ledger; queries never become part of a public entity's intrinsic score.

`npm run dev` provides the same local API while developing. The [public Pages Corpus](https://pradeeptathineni.github.io/signals-ai/) is a read-only generated view. It cannot start the user's AI or read `.signals/`.

## Discovery

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

The current `signal-strength-v4` index uses `25C + 20A + 20M + 15F + 10H + 10V - risk` for ordinary entities: corroboration, adoption, maturity, currentness, authority and verification. Source-bound numeric popularity uses fixed capped logarithmic anchors; stars and other attention counters earn at most five points. Independent mentions earn corroboration credit, while stronger adoption needs independent use. Repeated publishers/mirrors cannot create extra support. Unknown features earn zero. See the [exact policy and anchors](docs/signals-contract.md).

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
