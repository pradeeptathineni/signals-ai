# Signals AI

Signals helps people and machines find, understand and compare source-backed knowledge.
Browse useful options, inspect the claims and sources behind them, and keep private project
choices local. Recommendations do not install or execute anything.

This is pre-1 software. The premature v1.0.0 designation was withdrawn; its commit and evidence
history remain available. See [the product contract](docs/signals-contract.md) and
[the changelog](CHANGELOG.md).

## Browse public knowledge

The [public preview](https://pradeeptathineni.github.io/signals-ai/) contains the reviewed
Git-held collection in [signals/](signals/). It needs no account, database, model or key.
Search text, combine filters, compare two options and follow their original sources.
Download matching structured results or exact evidence bundles when a machine needs them.

To build and inspect the same preview locally:

```bash
npm ci
npm run corpus:build
npm run corpus:preview
```

For development, `npm run dev` opens the same Git-backed product. `npm run build` and
`npm run verify` also work without PostgreSQL or Docker.

Open [the local preview](http://127.0.0.1:4178/signals-ai/). Text matching is literal:
each entered term must occur in the public fields. It does not interpret a research question.
The CLI uses the same IDs and filters:

```bash
npm run corpus -- search '--query=water meter' --category=Household --sourceClass=guidance
npm run corpus -- search --concept=context.retrieval
npm run corpus -- search --githubOnly=true
npm run corpus -- check
```

The collection uses [signal-type folders](signals/README.md) with one JSON record per finding.
Domains and tags are metadata. [Authoring](signals/README.md) explains how an agent can save a
researched public query and its options directly in Git.
Pages renders these same records; there is no separate hosted database.

## Optional private application compatibility

The retained private application uses Node 24.19.x, npm 12.1.x, Docker/Compose and loopback
ports 4310, 5173 and 54329. Inspect existing containers and the exact database destination first:
the default volume can contain retained development data.

```bash
docker compose up -d
npm run db:init
npm run build:local-app
npm run dev:local-app
```

Open [the local app](http://127.0.0.1:5173). Corpus text search works immediately without a model
or network calls. Source support, review state and ranking details are separate. Numeric historical
ranking is optional detail; missing coverage is unknown.

For a new need, use your own research agent through **Exchange**, or explicitly configure a
loopback structured-output model and permitted sources in **Workspace**. Indexed Corpus search
does not start a model run. The configured model action is separate; an unavailable model cannot
erase indexed results. No hosted fallback, automatic model download or subscription credential
extraction is provided.

Review source-bound drafts before admission. Export returns the stored bytes unchanged.
Corrections create successors; feedback binds the exact evidence option and consumer task.
[The product contract](docs/signals-contract.md) documents the API/CLI, modes, privacy and replay.

## Verify safely

`npm test`, `npm run typecheck`, `npm run lint` and `npm run format:check` do not rebuild databases.
`npm run test:corpus` verifies the built public preview with Chromium and axe.

Only `npm run verify:local-app`, integration tests and private-app browser tests rebuild schemas.
That compatibility gate also
initializes `DATABASE_URL`. Provision and inspect a named disposable PostgreSQL container on a
non-default loopback port. Set explicit, distinct `DATABASE_URL` and `TEST_DATABASE_URL` destinations,
then run:

```bash
npm run verify:local-app
```

Never use retained data for that gate. Migration files are hash-checked and forward-only.
Back up and test restoration before upgrading retained state.

## Ownership and limits

Git is the database for the public product. Signal records are canonical; indexes and Pages output are views.
The optional PostgreSQL application preserves existing local knowledge, private queries/projects/
decisions and operational records. A locally imported copy of a curated bundle does not become a second editable
master. Public promotion requires review recorded in the closed public record; arbitrary
extensions, consumer constraints and workspace/ops records are excluded.

[Architecture](ARCHITECTURE.md), [the ownership decision](docs/architecture/ADR-006-public-corpus.md)
and [the schema map](docs/architecture/schema.md) describe the maintained boundaries.
Exact source observation, review and publication dates remain distinct. Claim-specific freshness
is advice; a digest proves byte integrity, and neither is proof of truth or calibrated probability.

Agent research, deterministic tests, independent agent review and browser checks are distinct
evidence classes. Human usefulness, configured-live model quality and broad research superiority
remain unestablished. Only verified 0.x milestones are authorized; a future stable release needs
a separate user decision.

The Context selection is pinned in [`.context-ai/selection.json`](.context-ai/selection.json).
It contains portable resource hashes; materialized instructions stay in Git, while the bound
installation receipt stays local. A clean clone can read the checked-in guidance directly.
The matching Context source can reproduce the selection with `context_ai.py apply --lock`
in an empty consumer directory. A clone has no local ownership receipt, so applying over its
already materialized files correctly refuses. To move an existing managed installation, retain
its local receipt and use checked `rebind` before an upgrade; never invent ownership of edited files.
Read only the selected modules needed for the current task stage.
