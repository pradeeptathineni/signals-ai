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

Ask an ordinary question through your research agent or local view. The agent acquires primary
sources and generates the record; humans do not define evidence receipts, hashes or ratings.
The automatic admission command checks source/identity/privacy boundaries and a separately
attributed model review. Every relevance, evidence, usefulness and clarity rating must be at least
3/4; blockers or uncertain material claims hold the draft. A score is review policy, not probability.

New records use `encoding: pretty-json-v1`. Evidence digests verify unchanged bytes for consumers;
they do not prove truth. Agents use the Git research protocol and admission command, then verify
the preview and diff. Merely saving a private question does not admit knowledge.

`review.state: withdrawn` removes options from default results while preserving their exact
downloads and history. Correcting frozen evidence requires new identities and review; existing
pins retain their original bytes. Review dates never refresh source observations. JSON indexes,
sidecars and Pages assets are generated only in `dist/`, not stored as sibling masters.

Keep drafts, private questions and raw acquisition outside this public collection. Unknown
files, fields, duplicate keys, ambiguous identities, private extensions and incomplete reviews
fail validation. There is no database service or compatibility option. Retained private history
lives in ignored `.signals/retained/` files and preserves historical meanings.
