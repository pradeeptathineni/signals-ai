import { readFile, lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { atomicJson, withWriter, secureDirectory } from './search-store.js';
import { fetchEvidence, digest } from './search-fetch.js';
import type { SearchSettings } from './search-settings.js';
import { Type } from 'typebox';
import { Value } from 'typebox/value';

const sourceStateSchema = Type.Record(
  Type.String({ maxLength: 2048 }),
  Type.Object(
    {
      exposures: Type.Integer({ minimum: 0 }),
      opportunities: Type.Integer({ minimum: 0 }),
      distinctOrigins: Type.Array(Type.String({ maxLength: 253 }), { maxItems: 10000 }),
      links: Type.Array(Type.String({ maxLength: 2048 }), { maxItems: 200 }),
      digest: Type.String({ pattern: '^[a-f0-9]{64}$' }),
      fetchedAt: Type.String({ maxLength: 40 }),
      state: Type.String({ maxLength: 80 }),
      feedback: Type.Union([Type.Null(), Type.Number()]),
    },
    { additionalProperties: false },
  ),
);
export async function scanSources(
  settings: SearchSettings,
  root: string,
  options: {
    interest?: string;
    persist?: boolean;
    signal?: AbortSignal;
    fetch?: typeof fetchEvidence;
  } = {},
) {
  const run = async () => {
    if (options.persist) await secureDirectory(resolve(root, '.signals'));
    const path = resolve(root, '.signals/source-state.json');
    const stat = options.persist
      ? await lstat(path).catch((e: NodeJS.ErrnoException) => {
          if (e.code !== 'ENOENT') throw e;
          return null;
        })
      : null;
    if (stat?.isSymbolicLink() || (stat && stat.size > 2000000))
      throw new Error('unsafe_source_state');
    const state: unknown = stat ? JSON.parse(await readFile(path, 'utf8')) : {};
    if (!Value.Check(sourceStateSchema, state)) throw new Error('invalid_source_state');
    const sources = [];
    for (const source of (settings.followedSources ?? []).filter(
      (s) =>
        s.enabled &&
        (!options.interest || !s.interests.length || s.interests.includes(options.interest)),
    )) {
      options.signal?.throwIfAborted();
      const prior = state[source.uri];
      try {
        const document = await (options.fetch ?? fetchEvidence)(source.uri, options.signal);
        const links = document.material?.links ?? [];
        const urls = links.map((link) => link.uri).sort();
        const hash = digest(JSON.stringify({ text: document.text, urls }));
        const newLinks = links.filter((link) => !prior?.links.includes(link.uri));
        state[source.uri] = {
          exposures: (prior?.exposures ?? 0) + 1,
          opportunities: (prior?.opportunities ?? 0) + newLinks.length,
          distinctOrigins: [
            ...new Set([
              ...(prior?.distinctOrigins ?? []),
              ...newLinks.map((link) => new URL(link.uri).hostname),
            ]),
          ],
          links: urls,
          digest: hash,
          fetchedAt: new Date().toISOString(),
          state: 'fetched',
          feedback: prior?.feedback ?? null,
        };
        sources.push({
          uri: source.uri,
          label: source.label,
          state: 'fetched',
          delta: !prior
            ? 'first-inspection'
            : prior.digest === hash
              ? 'unchanged'
              : 'content-changed-meaning-unassessed',
          newLinks,
          health: state[source.uri],
        });
      } catch (e) {
        sources.push({
          uri: source.uri,
          label: source.label,
          state: 'failed',
          reason: e instanceof Error ? e.message : 'source_failed',
          newLinks: [],
        });
      }
    }
    if (options.persist) await atomicJson(path, state);
    return {
      sources,
      kind: 'unassessed-source-scan',
      modelCalls: 0,
      broadExploration:
        'Still available; followed sources are supplemental, never an implicit allowlist.',
    };
  };
  return options.persist ? withWriter(root, run) : run();
}
