# Git-backed Signals

Each JSON file under a signal type is one reviewed research finding. Pages is the human view;
the browser and CLI derive the same options, claims and source bindings from these records.

```text
signals/
  practices/git-history.json
  standards/source-lineage.json
  tools/text-retrieval.json
```

Types provide one level of organization. Add news, languages, plugins or another useful type
when actual records require it. Domain is the review's `category` metadata, and tags are the
evidence need's `concept_ids`; neither needs a duplicated directory hierarchy or fixed ontology.
One finding can compare multiple options supported by its shared source set.

To save a new researched public query, use a record as the structure. Give the evidence a new
bundle/option identity, record its actual question, tags, primary sources, observation dates,
claims, options and limitations. Review source support, rights and privacy; set actor/date,
rationale and per-claim freshness. Agent review stays labelled `agent-reviewed`. Merely saving
a question does not establish useful knowledge.

Run `npm run corpus -- digest /absolute/path/to/record.json` and save the returned digest in
`review.digest`. New records use `encoding: pretty-json-v1`. The digest checks interchange
structure, not claim truth. Run `npm run verify`, inspect the preview and Git diff, then commit
the reviewed record. No database, container, account or model service is required.

`review.state: withdrawn` removes options from default results while preserving their exact
downloads and history. Correcting frozen evidence requires new identities and review; existing
pins retain their original bytes. Review dates never refresh source observations. JSON indexes,
sidecars and Pages assets are generated only in `dist/`, not stored as sibling masters.

Keep drafts, private questions and raw acquisition outside this public collection. Unknown
files, fields, duplicate keys, ambiguous identities, private extensions and incomplete reviews
fail validation. PostgreSQL is only an optional compatibility path for existing private data.
