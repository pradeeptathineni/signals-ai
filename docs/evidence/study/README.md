# Small actual usefulness study

Production implementation was frozen at `22183f4875c8838b33670afa1866e104b971adbc` before selecting
the six needs, including previously unseen bird-journal and family-photo questions. Selection and
source-grounded direct answers, exact exports, admission/Corpus links and observed timings are in
[results.json](results.json). Later review repairs concern integrity and interoperability; no study
vocabulary or expected answers were added to production prompts or semantics.

Each method had the same maximum evidence budget: three search queries, four distinct attempted
source pages, three primary sources/options, ten acquisition minutes and no paid API calls. Reads
of already acquired sections are not new acquisitions. This is a declared bounded builder exercise,
not a preregistered benchmark. Website cases reused the real pinned primary set and current official
documentation. Direct-agent prose used the same selected source set as the structured drafts.
There was no additional model provider and no independent or blinded answerer/grader.

All six drafts went through actual API validation, explicitly labelled agent review, durable Corpus
admission and exact-byte export. They contain 14 supported source-bound claims/options. Original
sources and meaningful limitations travel with the exports. The two Cornell resources retain one
lineage group. Photograph guidance retains differing glove details and unknown material/condition;
it does not turn that disagreement into an invented universal treatment.

The fallback was measured on a preserved seed-only disposable upgrade database, with all six
queries before any study admissions. The initial development-database outputs were cumulative;
they are retained separately and excluded from conclusions. This controls cross-case ingestion
contamination. It also means the baseline has its documented seeded scope rather than the newly
acquired primary sources.

| Need                            | Seed fallback returned | Structured reference set | Builder assessment and remaining gap                                                                                                                                                                                                    |
| ------------------------------- | ---------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coherent React/Vite research UI | 3                      | 3                        | Existing app/tool leads omit direct design and React interface evidence. Draft groups design critique, advisory React rules and native lazy loading; no design-method superiority proof.                                                |
| Accessibility and measurement   | 1                      | 3                        | The Reticle lead alone omits WCAG and the limits of automated/lab measurement. Draft cites normative reflow/keyboard, Playwright/axe and field/lab distinctions; human/field validation absent.                                         |
| Agent context and procedures    | 37                     | 2                        | Useful AGENTS/skills references coexist with many broader tools. The two-source draft narrows to the user's instruction/procedure need; native discovery remains provider-specific.                                                     |
| Typed local API/retries         | 3                      | 2                        | Ollama/prompt-caching/harness leads do not establish the Fastify/Graphile interfaces. Draft supports reuse of developer-owned schemas and task metadata; two attempted extra Graphile pages failed, so detailed backoff is not claimed. |
| Beginner bird journal           | 0                      | 2                        | The seed has no relevant reference. Cornell supports notes and optional checklist fields; neither software installation nor a regional identification guarantee follows.                                                                |
| Family printed photographs      | 4                      | 2                        | Tool/SRE inclusions are irrelevant to physical storage. LOC/NARA support careful handling and enclosures; material-specific restoration and prices remain unknown.                                                                      |

The ordinary direct answers were concise and actionable on the same sources. The structured path's
observed contribution was persistence, per-claim citation binding, explicit uncertainty, review and
portable exact exports. It did not demonstrate better reasoning than the direct answers. Candidate
fit and false-inclusion/omission judgments in the table are this builder's reading, not independent
ground truth or numeric calibrated confidence. The small selected reference sets omit alternatives;
they are not comprehensive surveys.

The validation/admission/export pipeline took 256–521 ms per case on the local disposable database,
excluding acquisition, agent writing, evaluation and consumer use. Separate seed retrieval timings
are retained in results. Batched acquisition prevents a defensible per-case wall-time comparison;
token usage was unavailable. No broad speed, cost, token-saving or research superiority claim is made.
