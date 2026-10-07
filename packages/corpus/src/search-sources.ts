import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { atomicJson, withWriter, secureDirectory } from './search-store.js';
import { fetchEvidence, digest } from './search-fetch.js';
import type { SearchSettings } from './search-settings.js';

interface SourceState {
  exposures: number;
  opportunities: number;
  distinctOrigins: string[];
  links: string[];
  digest: string;
  fetchedAt: string;
  state: string;
  feedback: null | number;
}
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
    const state: Record<string, SourceState> = options.persist
      ? (JSON.parse(
          await readFile(path, 'utf8').catch((e: NodeJS.ErrnoException) => {
            if (e.code !== 'ENOENT') throw e;
            return '{}';
          }),
        ) as Record<string, SourceState>)
      : {};
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
