# v1 whole-diff self-review

This builder reviewed the complete change from `f21844f`, including actual exports, migrations,
API contracts, Corpus revisions, configuration compatibility, UI behavior, source acquisition and
the managed Context closure. This is self-review, not an independent reviewer or human approval.

Repairs made before release:

- Exact-byte JSON with duplicate or escaped-equivalent names is rejected. Future creation dates,
  extension policy authority and private extension scopes fail admission.
- Nested extension data has a bounded depth before recursive privacy checks. Corpus admission
  audit events carry the actual appended document revision; OpenAPI identifies the shipped version.
- Review replay binds actor, rationale, blockers and predecessor. Changed inputs cannot relabel
  an immutable admission. A competing successor returns a conflict while preserving the chain.
- Direct database writers must supply the exact byte digest and valid candidate bindings for
  feedback/readiness. Corrections append records; they do not rewrite historical receipts.
- Linked failed/regressed trial feedback overrides a declared successful bounded check; useful
  feedback only supports adoption within the exact reviewed bundle/candidate and purpose.
- Corpus shows and retrieves the latest document revision. Unknown upstream observation dates
  remain explicitly unknown. Original exports and old query-result hashes remain unchanged.
- Mutation headers accept the documented naming transition; conflicting old/new configuration
  fails startup. CI uses explicit isolated development/test databases on a non-default port.
- The usefulness comparison was corrected to a seed-only database, removing cumulative admission
  contamination. No study query vocabulary entered production semantics.
- Peer checkpoints pair each advertised evidence bundle with its actual producer commit; the
  original early bundle stays immutable. Consumer acceptance never activates a capability.

The adopted architecture remains React/Vite, Fastify/TypeBox, PostgreSQL/Drizzle and Graphile Worker.
Ajv with formats is the narrow frozen-schema validator. Existing packing/compression, research
protocols, authoring and browser tools own their established jobs. Signals does not acquire a
composer, agent runtime, gateway, candidate execution authority or universal concept dictionary.

Prior-art decisions retain the approved stack, trial Impeccable as instructions, read applicable
Vercel React guidance, keep frontend-design as a fallback reference, and reuse Playwright/axe.
No local-use evidence supports universal design benefit or comparative research superiority.
Reconsider these choices on an observed failure, incompatible version/license or better tested fit.

Verification separates synthetic invariants from actual public-source acquisition, real database
admission/export, the archived Context importer and browser observations. Configured model-led
research, independent usefulness, human usability and field Web Vitals remain unmeasured.
