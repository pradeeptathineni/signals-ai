# ADR-010: ranked word retrieval alongside precise filters

Status: accepted, 2026-10-05.

The eight actual concept questions returned only one full-question literal match after the
source review added six findings. Requiring every function word rejected useful vocabulary
overlaps. Pages keyword filtering still serves precise inspection, so retain it explicitly.

MiniSearch 7.2.0 supplies the generic in-memory word index instead of a bespoke ranker or
evaluation vocabulary. Index only admitted public names, needs, claims, reasons, categories,
concepts and source titles. Exact filters constrain the collection before indexing. Use OR
word matching, normal library tokenization and name boost 2; disable fuzzy and prefix matching.
No custom synonyms, stop words, embeddings or query-specific branches are introduced.

Pages and the Corpus CLI expose the same literal/ranked choice. Research questions use up to
eight ranked candidates; the model receives those first and then the remaining constrained
collection, capped at 48. Failure preserves lexical candidates and exact match IDs. Rankings
are word similarity, not intrinsic signal, semantic fit, truth or probability. Common-word false
inclusions remain possible and require source-aware interpretation and the second review call.

The earlier threshold and all material admission checks remain unchanged. Derived indexes
rebuild from Git; no server, index service or database is needed. Public filters/browser parity,
absence of matches, excluded-domain results and model evidence binding are regression boundaries.
Evaluate fixed full questions without injecting their desired answers into production logic.

Primary package documentation: [MiniSearch](https://lucaong.github.io/minisearch/), observed
2026-10-05. Runtime composition is authorized development tooling; cataloging other systems
does not authorize installing or executing them.
