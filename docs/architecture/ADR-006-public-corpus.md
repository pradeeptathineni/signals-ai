# ADR-006: curated public files with derived views

Status: accepted. Date: 2026-10-05. Software remains pre-1; evidence schema v1 remains unchanged.

People need to find, inspect and compare supported options without configuring a model, authoring
JSON or navigating receipt graphs. Machines need the same option IDs, sources and filter behavior.

## Ownership

`corpus/manifest.json` explicitly admits reviewed public evidence files. The frozen v1 bundle
owns exact source/claim/option bytes; the manifest owns review attribution, category and each
claim's freshness basis. Each claim has one stable, volatile or unknown assessment. Volatile
claims have an explicit review interval. Observation, review and publication dates remain separate.
Missing observation is unknown; publishing again does not refresh it. Browser visits recompute
due dates from these retained inputs.

Git owns this small curated collection. PostgreSQL continues to own independently acquired local
knowledge, private queries/projects/choices and operational drafts/jobs. Importing a curated bundle
through the existing evidence admission path creates a local projection; that copy does not become
an independently editable master of the curated file. Exporting local research does not automatically
publish it. Promotion to Git requires source/rights/privacy review and an explicit manifest entry.

Corrections to exact evidence create successor bundles. Remove withdrawn records from the active
manifest while retaining their pinned bytes/history for consumers. Applied migrations and stored
evidence are preserved. This change does not migrate or export any retained user database.

## Shared read path

The loader validates exact digests, closed public fields, source bindings, review completeness,
unique identities and contained paths before producing anything. Public files exclude consumer
constraints, arbitrary extensions and numeric candidate signals. These field guards supplement
review; they cannot decide whether arbitrary prose discloses a private fact.

The CLI and browser share a literal text/filter function. Text matches every supplied term in
public names, needs, reasons, categories, concepts, claims or source titles. Exact category,
concept, source-kind, GitHub-host and freshness filters combine conjunctively. They operate on
the reviewed public-file universe, separately from the local server's larger indexed Corpus.
No vocabulary dictionary, model call, ranking score or semantic-completeness claim is involved.

Derived public snapshots are completed in a sibling directory, then selected by an atomic pointer
replacement. A failed staging write leaves the previous snapshot readable. Unselected snapshots
are disposable build artifacts. Vite copies the completed snapshot into the Pages output; only
that reviewed output is uploaded. The public browser validates downloaded projections before
rendering. It offers source links, comparison, clear/reset, structured results and optional exact
bundle downloads. It has no private API, analytics or model endpoint.

## Alternatives and discriminating checks

- **Database-only:** retain for independent local acquisition and operational workloads; it
  requires a running local stack for browsing and cannot supply readable reviewed Git diffs alone.
- **Files-only:** use for the curated public slice; it does not replace transactions, jobs,
  private history or the larger server index. No generic storage adapter is added.
- **MiniSearch:** defer until fuzzy/prefix/ranked lexical matching changes a real task outcome.
  Its [documented interface](https://lucaong.github.io/minisearch/) fits an in-memory collection,
  but no local library trial or efficiency advantage is claimed.
- **Pagefind:** defer until a substantial generated document site needs an HTML index. Its
  [filters](https://pagefind.app/docs/filtering/) address that responsibility; structured
  machine/browser parity would still require a trial.

Matched checks exercise real records and combined constraints, plus tampered/incomplete files,
path escape, malformed downloads and interrupted staging. Browser checks cover keyboard entry,
responsive comparison, no-match recovery, exact downloads and axe. Independent review identified
and corrected partial-export, malformed-index and stale research-query binding defects.
These are deterministic, browser and agent-review observations, not human usefulness validation.

Reopen this choice for demonstrated ranking/typo omissions, a larger document workload, a public
write workflow, rights uncertainty or an actual retained-data migration. Hosting the preview does
not grant authority to publish local workspace or raw research state.
