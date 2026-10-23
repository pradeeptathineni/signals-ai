# Dependencies

`package.json` and `package-lock.json` pin exact reviewed versions. The supported toolchain is Node 24.19+ within Node 24 and npm 12.1+ within npm 12. `npm run security:dependencies` checks installed direct versions and MIT, Apache-2.0, ISC or MPL-2.0 licences. `security:audit` applies the advisory policy; `security:secrets` checks publication boundaries.

## Runtime

| Package              |    Version | License    | Purpose                                        |
| -------------------- | ---------: | ---------- | ---------------------------------------------- |
| React / React DOM    |     19.3.0 | MIT        | Local workbench and static public view         |
| TypeBox              |     1.3.34 | MIT        | Closed typed record/request validation         |
| Ajv                  |     8.20.0 | MIT        | Frozen draft-2020 peer schema validation       |
| ajv-formats          |      3.0.1 | MIT        | Peer schema formats                            |
| MiniSearch           |      7.2.0 | MIT        | In-memory native/historical metadata retrieval |
| @mozilla/readability |      0.6.0 | Apache-2.0 | Static document extraction                     |
| linkedom             |    0.18.13 | ISC        | Inert DOM without script/resource execution    |
| rss-parser           |     3.13.0 | MIT        | RSS/Atom parsing from safely fetched bytes     |
| research-ai          | 0.4.0-rc.1 | MIT        | Bounded research and retained-source support   |

`@pradeeptathineni/research-ai` is first-party with no runtime dependencies. This unpublished candidate uses the content-addressed archive under `vendor/research-ai/`, built from isolated source commit `165713c10478a5b68d949dadb922de9c08af1a51`, pending integrator acceptance. The checker verifies exact SHA-256 bytes, lockfile SHA-512, version, MIT license, and an extracted installation instead of a directory link. The archive contains its MIT LICENSE and ALCE method notice; no external judge weights or datasets are included. The prior accepted `c362b33a544bce8e3f4cce7f305bc32cddb90342` archive remains tracked for rollback. Project-local `allow-remote=root` still limits remote dependencies under npm 12. Vitest inlines Research so process and OS test fakes apply.

Node HTTPS/DNS/filesystem/child-process primitives own safe acquisition, bounded project previews, file writes, the loopback API, headless supervision and interval scheduling. Linkedom does not grant transport authority; original outlinks are harvested before Readability. RSS entity declarations are rejected. Ajv does not coerce or insert defaults; domain checks own semantic references/privacy. Frozen schema bytes are excluded from formatting to preserve their digest.

Headless research supervises the user's installed authenticated Codex CLI; invoking Agent Skills hosts use their own permitted tools. Optional external acquisition/extraction providers have [separate reviewed pins and constraints](providers.md). Cataloging a tool never installs it.

## Development

Vite 8.3.3, TypeScript 6.0.3, Playwright 1.63.0, Vitest 5.0.2 and Prettier 3.9.9 are pinned development tools. Prettier also encodes historical public downloads reproducibly. ESLint and axe check code/accessibility; Knip 6.38.0 and jscpd 5.3.3 inspect unused structure and duplication. Repomix 1.18.1 creates bounded source maps; its SDK dependency is scoped to patched `@modelcontextprotocol/sdk@1.32.0` without enabling MCP. CCA 0.2.0 supports a reversible context hook. CCA recovery preserves normalized/redacted text rather than promising original stdout/stderr bytes. See [AI authoring context](../.meta/context/README.md) for use boundaries.

GitHub Pages actions are pinned to reviewed upstream commits in `.github/workflows/pages.yml`. They upload validated static public output only. No database driver/service, crawler SDK, hosted authentication or general agent runtime is installed.

## Advisory policy

The lockfile pins patched `handlebars@4.7.10` and `source-map-js@1.2.2`. Neither receives an advisory waiver.

The one exact development exception is [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) through `repomix@1.18.1 → globby@16.2.4 → micromatch@4.0.8 → braces@3.0.3`. Repomix is excluded from the shipped application. The `context:pack` wrapper rejects caller arguments, disables Git/dot-ignore/package-default patterns, refuses implicit ignore files and prohibits brace expansion and oversized configured patterns/output paths. It uses a fixed argument array.

The audit gate requires the exact advisory payload/path while that vulnerable path remains. It rejects malformed/inconsistent metadata, additional high/critical advisories, nested advisories, runtime reachability, changed versions/paths/invocation or changed fix metadata. A patched release must be reviewed rather than silently remaining excepted. Even an unexpectedly clean report fails while the known vulnerable path is installed.

Dependency checks describe their inspected tree and advisory data; they do not establish universal safety. npm may block optional esbuild/fsevents lifecycle scripts; the effective installation is checked through the pinned build/browser gate without changing global policy.
