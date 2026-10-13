# Signals AI

Signals researches questions, explains worthwhile findings, and retains knowledge for personal interests and projects. The Library combines saved native entities and reviewed historical findings. Your AI supplies interpretation; code checks evidence bindings, computes versioned scores, and preserves portable records.

The local workspace opens on Home with retained discoveries and recent searches. Search offers Library, Online and Combined scopes. Projects connects selected repository or folder snapshots to findings. Following manages interests and sources. The [public Corpus](https://pradeeptathineni.github.io/signals-ai/) is a read-only view of approved public records.

## Start locally

Use Node 24.19 or later in the Node 24 series and npm 12.1 or later in the npm 12 series.

```sh
npm ci
npm run build
npm run start
```

Open [the workbench](http://127.0.0.1:5178/signals-ai/). Browsing saved knowledge starts no research or source scan. For development, use `npm run dev`.

Library returns immediate phrase, prefix and typo matches over retained metadata. In Settings → Personal Library, you can permit one no-web meaning match per submitted question. Its disclosure lists the metadata sent to your authenticated AI host; notes, projects, source text and credentials are excluded. Literal results remain available if matching is disabled, unavailable or cancelled. Public Pages uses literal retrieval only.

```sh
npm run research -- library-query 'remembered purpose'
npm run research -- library-query 'remembered purpose' --public
```

## Research with your AI

The [signal-search skill](.meta/context/skills/signal-search/SKILL.md) uses the invoking AI's permitted search and reading tools without launching another AI. Ask an ordinary question; the agent creates the structured assessment. Other Agent Skills hosts can use the [same protocol](.meta/context/skills/signal-search/references/protocol.md).

Headless research uses an installed, authenticated Codex CLI. Queries and selected evidence go to its configured provider; credentials stay with the CLI. Settings reports runner readiness and lets you select model, effort and research depth. Local control does not imply local inference.

```sh
npm run signal-search -- --capability
npm run signal-search -- --query 'Which research tools preserve portable data and provenance?' --profile wide --save never
npm run signal-search -- --query 'Describe this resource and its limits' --url https://example.com/resource --save never
npm run signal-search -- --query 'model context protocol' --sources-only
```

Research preserves the original answer even when individual record metadata fails validation. Results expose interpreted needs and constraints, evidence passages, source gaps, comparison, and follow-up over selected frozen evidence. Cancellation and configured acquisition limits apply throughout. Capture URL is user-seeded acquisition; a returned locator alone is an unassessed lead.

`--profile quick` selects a smaller acquisition budget; `wide` selects the larger one. `--model` and `--effort` override runner references. Repeat `--source` to constrain source families or `--site HTTPS_URL` to add website/path scopes. Global and per-interest supplemental sites share a twenty-scope effective limit and the existing research budget. Access denial remains a gap.

`--save never --cache memory` requires no existing Corpus and creates no repository state; the AI host may retain its own logs. `--cache private` retains run history locally. `--context` exports frozen schema-v1 interchange with separate native assessment extensions. Explicit `--review` requests a bounded no-web reassessment over fetched material; ordinary research uses one native task. See [optional providers](docs/providers.md) for acquisition and extraction settings.

### Keep a native research answer

Online Research options includes **Answer first; assess selected citations later**. The CLI exposes the same opt-in route:

```sh
npm run signal-search -- --query 'Your research question' --method answer-first --cache private --save never
```

This uses one authenticated Codex session to obtain ordinary Markdown without the assessment schema. The complete answer appears before citation assessment, with **Confidence Unknown** and an explicit unassessed state. Private Library indexes the entire answer locally; reopen it from Library or Activity and discuss a selected answer as prior synthesis. Whole answer text is excluded from remote meaning-match metadata. Automatic public admission is unavailable on this route. Select **Assess this citation** to obtain a separate source-grounded assessment linked to the immutable answer. Assessing does not rewrite the earlier narrative. This route has no demonstrated research-quality or speed advantage yet.

For a narrower check, enter a **Proposition to check** and select its citation. The same route is available in the CLI:

```sh
npm run signal-search -- --query 'Original question' --assessment-of ANSWER_RUN_UUID --url https://example.org/primary --claim 'The exact proposition to check' --profile quick --cache private --save never
```

This checks one proposition against one or two selected cited sources, with no broad discovery or scoring. When no selected primary text is usable, the check returns an acquisition outcome without inference. Missing-source gaps remain visible when other selected text is reviewed. One frozen native review may return supported, contradicted or uncertain; matched quotes prove occurrence rather than entailment. The bounded text snapshot, original dates and negative/partial checks remain linked to the original answer. Confidence stays Unknown. `--cache memory` returns proof without saving history. A source access denial says nothing about the claim's truth or permission. This focused route has no measured quality or speed advantage yet.

For a proposition and primary URLs you supply directly, choose **Check a proposition against primary sources** in Online → Research options. Enter the exact proposition and one or two public HTTPS URLs, then select **Check primary sources**. The same opt-in route is available without creating a research answer in the CLI:

```sh
npm run signal-search -- --query 'The factual question' --claim-origin request --claim 'The exact proposition' --url https://example.org/primary --profile quick --cache private --save never
```

This acquires one or two selected primary documents before at most one frozen review. Acquisition failures, partial scope and Unknown confidence remain explicit. It creates no entity or numeric Signal. Direct checks preserve the question, context, proposition and selected URLs in their own request-origin receipt. Reopen private results from Activity. Linked answer checks keep their original citation and parent requirements. Direct history, including negative or incomplete checks, survives ordinary temporary-run cleanup. `--cache memory` creates no history or source-cache state. Historical source references, broad acquisition, enrichment and offline ingestion are unavailable on the direct route. A scoped verdict is not a full item assessment or installation permission. Comparative research quality, calibrated accuracy and human usefulness remain unmeasured. The `--context` entity-evidence export does not carry claim-check verdicts or snapshots and explicitly reports this omission. Inspect the original private receipt when making a scoped consumer decision.

You can also bring an ordinary Markdown answer from your AI into the Personal Library. This command preserves the original answer and observation time, lists its inline citations, and makes no model call:

```sh
npm run research-answer -- --query 'Your original question' --answer-file /path/to/answer.md --observed-at '2026-10-12T07:43:44.655Z' --root /path/to/private-library
```

Inspect that plan, then add `--retain` to save the answer privately. Repeat `--select HTTPS_URL` for each cited source you choose to retain as an unassessed lead. With no selected sources, only the answer is saved. The command reports saved paths and a recovery receipt; inspect any partial or uncertain outcome before explicitly trying again.

```sh
npm run research-answer -- --root /path/to/private-library --rediscover 'remembered source or purpose'
```

The private Library searches and reopens complete imported answers alongside selected leads, including earlier imports read in place without migration. This CLI rediscovery command searches selected saved leads. Repeated explicit saves preserve answer receipts and deduplicate normalized citation locators. Citation occurrence does not verify a claim; confidence, source publication date, license and access remain unknown. Neither import nor answer-first creates a public record. Answers are limited to 100,000 characters and the existing private byte budget; an oversized answer fails visibly rather than silently truncating. Selected-answer discussion passes complete answers within a disclosed discussion budget and reports omitted answers.

## Retain, compare and refresh

Manual personal saving accepts unassessed leads. Optional automatic personal saving is off by default and requires completed assessment, supported resolved identity, relevance at least 75 and the chosen Signal threshold, initially 75. Public inclusion and publication have separate review and owner boundaries. CLI `--save eligible` writes eligible public entities locally; it does not commit or push.

Cards distinguish intrinsic Signal, query relevance, contextual priority and saved state. Evidence strength is a versioned policy judgment, not probability or demonstrated usefulness. Native brief v7 uses `signal-strength-v10`; older records replay their declared numerical policies, while current admission retains unresolved decisive history across refresh formats. The [assessment contract](docs/signals-contract.md) defines these meanings.

Notes, feedback, dismissals, followed sources, inbox entries and saved question/interest associations remain private under `.signals/`. Personal novelty stays unknown until you supply feedback. A source scan records acquisition and newly exposed links; repeated scans do not invent discoveries or usefulness. Changed source content requires assessment before becoming a meaningful claim change.

Primary checks and refresh target the selected card's public or private store. An ambiguous duplicate requires an explicit destination:

```sh
npm run signal-search -- --check-primary ENTITY_ID --destination private
npm run signal-search -- --query 'What do my retained findings establish?' --corpus-only
npm run discovery -- save-run RUN_ID ENTITY_ID
```

Primary checks use HTTP validators or content digests before inference. Unchanged material requires no model call and does not renew claims. Access failure preserves the last good record. Follow-ups stay within selected frozen evidence; explicitly research online when new evidence is needed.

Projects reads an explicitly selected public GitHub repository or local folder through bounded documentation/manifest previews. Inspect the source basis and edit constraints before registration or external research. Updates mark earlier opportunities stale; disconnect preserves findings and decisions. General project opportunities belong to Signals. AI setup requests are advisory input to Context, which owns equipment selection, permissions, pins, delivery and undo.

## Interests and jobs

Settings and Following manage editable interests, query lists, supplemental sites and followed feeds/pages. Setup adds starter interests without enabling recurrence. One-shot lists select enabled interests, or the IDs supplied after `--once`; `--limit` overrides the configured batch size.

```sh
npm run discovery -- setup
npm run discovery -- status
npm run discovery -- plan-list
npm run discovery -- run-list --once --limit 3 --profile quick
npm run discovery -- run-list --once --resume BATCH_UUID --limit 3
```

`setup-concepts` adds the checked-in Context research catalog as interests. Its source snapshot is research input, separate from AI authoring guidance. Compatible interests can share unassessed acquisition; their conclusions remain separate. `run-list --once --no-share` disables shared acquisition for that activation. Completed, failed, cancelled and uncertain attempts remain inspectable; resume processes pending questions.

To opt into due query research or saved-entity refresh:

```sh
npm run discovery -- enable query
npm run discovery -- enable corpus
npm run discovery -- run-due --once
npm run discovery -- timer
npm run discovery -- disable both
```

Due slots coalesce missed intervals, and a durable lease prevents cooperating overlap. Completed slots replay without inference. Interrupted paid attempts become uncertain; inspect them before explicitly using `retry JOB_KEY`. The timer works only while its process and laptop are awake and registers no OS timer.

Publication defaults to local-only. `npm run discovery -- publish` performs an explicit reviewed Git commit/push from a clean, verified checkout. Unattended publication requires an explicit setting and uses the same Pages CI.

## Inspect and develop

```sh
npm run corpus -- check
npm run corpus -- search '--query=water meter' --category=Household
npm run research -- library-query 'How can I recover verbose test output?'
npm run verify
```

`library-query` reads the unified current collection with the same literal matching and optional metadata-only meaning matching as the workspace. `corpus search` inspects historical-format public records with exact type/category/concept/sourceClass/freshness/disposition filters and `--textMode=literal` or `ranked`. `corpus digest FILE.json` checks frozen evidence encoding. `research admit DRAFT.json TYPE` validates and admits a reviewed historical-format record.

`verify` checks structure, privacy, evidence replay and isolated development/built browser fixtures without a model service. `test:built` requires a current build. `library:coverage` reports public Library lexical coverage over the concept catalog, including native and historical findings; matches are not graded relevance or a quality benchmark. Its diagnostic output stays in ignored authoring context. These checks establish behavior under their conditions; live research quality, independent review and human usefulness require separate evidence. `clean` removes generated build/test output and `.meta/context/local/` maps, diagnostics and command recovery; archive needed receipts first. It preserves private product state.

See [product intent](docs/product.yaml), [architecture](ARCHITECTURE.md), [data map](docs/architecture/schema.md), [dependencies](docs/dependencies.md) and [AI authoring context](.meta/context/README.md). Signals is pre-1 software. Candidate installation/execution, arbitrary crawling, hosted authentication and cloud/model fallback are outside its authority.
