# ADR-008: Git-backed signal records, Pages as the human view

Status: accepted, 2026-10-05. Supersedes the canonical file format in ADR-006.

The public Corpus should be easy to save, process and render without a database service. Each
`signals/<type>/<finding>.json` owns one research need, tags, sources, claims, supported options,
limits and review. One finding can compare alternatives sharing the same source set. Domains
and tags are metadata; they do not duplicate the type hierarchy. Add types when useful records
require them rather than pre-building a universal taxonomy.

JSON is the sole editable source. Native parsing, duplicate-key rejection and the existing closed
schemas enforce record boundaries. Derived indexes drive Pages and machine clients. Pages is the
human viewing area; a separate human-readable record database is unnecessary. A single combined
file is generated for clients, without making unrelated findings share one editable history.
No sibling digest files or independently edited admission manifest are required.

Markdown was trialled on the same nine records and preserved every old consumer pin. It added a
custom grammar and conversion work without improving the actual Pages task. Given the intended
machine authoring and Pages reading workflow, native JSON removes that parser responsibility.
The tested prototype stays in local campaign evidence. It is not a second shipped master.

Nine single-file records replace nineteen bundle/sidecar/manifest files. Their generated v1
interchange bytes retain every original digest. Two explicitly named historical JSON encodings
preserve consumer pins; new records use native pretty JSON. Integrity hashes remain only for
download verification, exact consumer selection and replay. A withdrawn record leaves default
results while retaining its exact download. Git preserves earlier publication states.

Default `dev`, `build` and `verify` operate without PostgreSQL or Docker. The optional private
application preserves existing data, research workers and replay through separately named
compatibility commands. Those records were not promoted, mirrored or deleted. Removing that
implementation needs an inventory and verified export/restore of actual retained private data.
Starting its services is unnecessary for this public product.

Checks cover old pins, unknown fields, private metadata, duplicate keys, mixed masters, empty
replacement, withdrawal, source binding, complete atomic exports and shared browser/CLI filters.
Literal retrieval still has full-question omissions; no semantic-completeness or model-superiority
claim is made. Revisit indexing or another persistence owner only for a demonstrated task gap.
