# Dependency baseline

Record export reuses the existing exact-pinned Prettier 3.9.9 to preserve previously published
interchange bytes. Native JSON parsing plus duplicate-key rejection and the existing schema
validators enforce the closed record format. No database or new parser dependency is needed
for the public product. Combined indexes and interchange downloads are build output only.

The public Corpus preview reuses exact-pinned React/Vite, TypeBox's interpreted value checker,
Ajv, Playwright and axe. MiniSearch 7.2.0 (MIT, no external dependencies) adds ranked in-memory
word retrieval after full-question evaluation exposed all-word matching gaps. ADR-010 explains
the retained exact filters and limits. GitHub Pages actions are pinned to reviewed upstream commits in
`.github/workflows/pages.yml`; they upload only the validated static public output.

Evidence interchange v1 adds `ajv@8.20.0` and `ajv-formats@3.0.1` (MIT), reviewed
2026-10-05. A separate Ajv draft-2020 instance validates the frozen peer schema without
coercion or default insertion; semantic reference/privacy checks remain in the domain.
The exact schema bytes are excluded from formatting to preserve the interchange digest.

The runtime and verification packages are exact-pinned in `package.json` and `package-lock.json`.
The database retirement removes Fastify, PostgreSQL/Drizzle, Graphile, G6, Readability/jsdom,
TanStack Query, OpenTelemetry, undici and AI SDK from the installed product. Cataloging a toolkit
does not install it. Structured model calls use bounded native fetch to an explicitly configured
loopback endpoint. The current runtime dependency set is:

| Package           | Version | License | Relevant Node declaration |
| ----------------- | ------: | ------- | ------------------------- |
| React / React DOM |  19.3.0 | MIT     | compatible                |
| TypeBox           |  1.3.34 | MIT     | compatible                |
| Ajv               |  8.20.0 | MIT     | compatible                |
| ajv-formats       |   3.0.1 | MIT     | compatible                |
| MiniSearch        |   7.2.0 | MIT     | ES2018 Node and browsers  |

Development-only Phase 06 tools are exact-pinned: `repomix@1.18.1` (MIT) for bounded repository
maps, `@linger-alpha/cca@0.2.0` (MIT) for a reversible project hook, `knip@6.38.0` (ISC) for unused
code/dependencies, and `jscpd@5.3.3` (MIT) for clone detection. None grants runtime execution
authority or makes a catalog candidate trusted.

On 2026-10-02 GitHub reviewed `GHSA-vfj7-8cjw-p6xm`, a high-severity stack-exhaustion advisory
against every published `braces` version through the current `3.0.3`; upstream has no patched
release as of 2026-10-03. Maestro reaches it only through the exact development path
`repomix@1.18.1 -> globby@16.2.4 -> micromatch@4.0.8 -> braces@3.0.3`. The shipped application does
not include Repomix. `context:pack` uses a wrapper that rejects caller arguments, disables Git,
dot-ignore, and package-default pattern sources, refuses implicit `.repomixignore` files, prohibits
brace expansion and oversized patterns (including the output path) in the reviewed repository
configuration, and invokes Repomix with a fixed argument array. `security:audit` therefore requires
that one exact audit payload and
installed path while no fix exists; even an unexpectedly clean report fails while the vulnerable
path remains. It rejects malformed or inconsistent audit metadata, nested high/critical advisories,
any additional high/critical advisory, runtime reachability, version/path change, invocation change,
or changed fix metadata so a patched release must be reviewed and adopted rather than silently
remaining excepted.

Vite 8.3.1, TypeScript 6.0.3, Playwright 1.63.0, Vitest 5.0.2, Prettier 3.9.9 and the lint/structure
tools remain development dependencies. Node 24.19 and npm 12.1 are the tested toolchain.

The verification gate checks that all direct packages remain at their exact reviewed versions and
use the reviewed MIT, Apache-2.0, ISC, or MPL-2.0 licenses. The 2026-09-29 installed-tree audit
reported zero known vulnerabilities; the later, explicitly bounded no-fix exception is documented
above. These are time-scoped dependency checks, not a claim that the application or dependencies
are universally safe. CI and the local verification gate repeat them.

Npm's local build-script policy may block optional `esbuild`/`fsevents` lifecycle scripts. Maestro
does not require a global policy change: the pinned Vite build and browser gate are used to verify
the effective installation.

CCA recovery files contain normalized/redacted text. They preserve useful tested observations;
they do not promise original byte-for-byte stdout/stderr. No billing savings or general task-quality
benefit has been measured. Historical Phase 06 integrations remain in Git history only.
