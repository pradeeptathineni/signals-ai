import { resolve } from 'node:path';
import { atomicJson, withWriter, readPrivateJson } from './search-store.js';
import { fetchEvidence, digest } from './search-fetch.js';
import type { SearchSettings } from './search-settings.js';
import { Type, type Static } from 'typebox';
import type { SearchItem } from '../../domain/src/search-contract.js';
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
      feedbackByEntity: Type.Optional(
        Type.Record(
          Type.String({ pattern: '^entity-[a-f0-9]{24}$' }),
          Type.Enum(['useful', 'skip', 'mute', 'none']),
        ),
      ),
      resultExposures: Type.Optional(Type.Integer({ minimum: 0 })),
      scans: Type.Optional(Type.Integer({ minimum: 0 })),
    },
    { additionalProperties: false },
  ),
);
async function loadSourceState(root: string): Promise<Static<typeof sourceStateSchema>> {
  const state = await readPrivateJson(root, 'source-state.json', {}, 2000000);
  if (!Value.Check(sourceStateSchema, state)) throw new Error('invalid_source_state');
  return state;
}

/** Called inside the personal writer transaction; explicit votes replace, never accumulate. */
export async function creditSourceFeedback(
  root: string,
  parent: string,
  id: string,
  feedback: 'useful' | 'skip' | 'mute' | 'none',
) {
  const state = await loadSourceState(root);
  const source = state[parent];
  if (!source) return;
  source.feedbackByEntity = { ...source.feedbackByEntity, [id]: feedback };
  source.feedback = Object.values(source.feedbackByEntity).reduce(
    (sum, vote) => sum + (vote === 'useful' ? 1 : vote === 'none' ? 0 : -1),
    0,
  );
  await atomicJson(resolve(root, '.signals/source-state.json'), state);
}

export async function recordSourceResultExposures(root: string, items: SearchItem[]) {
  const parents = [
    ...new Set(
      items.flatMap((item) =>
        item.discovery?.linkVerified &&
        item.discovery.provenanceBasis === 'configured-source' &&
        item.discovery.parentUri
          ? [item.discovery.parentUri]
          : [],
      ),
    ),
  ];
  if (!parents.length) return;
  await withWriter(root, async () => {
    const state = await loadSourceState(root);
    for (const parent of parents)
      if (state[parent]) {
        state[parent].exposures++;
        state[parent].resultExposures = (state[parent].resultExposures ?? 0) + 1;
      }
    await atomicJson(resolve(root, '.signals/source-state.json'), state);
  });
}
export async function scanSources(
  settings: SearchSettings,
  root: string,
  options: {
    interest?: string;
    persist?: boolean;
    signal?: AbortSignal;
    fetch?: typeof fetchEvidence;
    recordExposure?: boolean;
  } = {},
) {
  const selected = (settings.followedSources ?? []).filter(
    (source) =>
      source.enabled &&
      (!options.interest ||
        !source.interests.length ||
        source.interests.includes(options.interest)),
  );
  const result = () => ({
    sources: [] as never[],
    kind: 'unassessed-source-scan',
    modelCalls: 0,
    broadExploration:
      'Still available; followed sources are supplemental, never an implicit allowlist.',
  });
  if (!selected.length) return result();
  if (options.persist) await loadSourceState(root);
  // Transport never owns the writer lock. Merge against current state only after acquisition.
  const acquired: {
    source: (typeof selected)[number];
    document: Awaited<ReturnType<typeof fetchEvidence>> | null;
    error: unknown;
  }[] = [];
  for (const source of selected) {
    options.signal?.throwIfAborted();
    try {
      acquired.push({
        source,
        document: await (options.fetch ?? fetchEvidence)(source.uri, options.signal),
        error: null,
      });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      acquired.push({ source, document: null, error });
    }
  }
  const run = async () => {
    const path = resolve(root, '.signals/source-state.json');
    const state = options.persist ? await loadSourceState(root) : {};
    const sources = [];
    for (const acquisition of acquired) {
      const { source } = acquisition;
      options.signal?.throwIfAborted();
      const prior = state[source.uri];
      try {
        if (!acquisition.document) throw acquisition.error;
        const document = acquisition.document;
        const links = document.material?.links ?? [];
        const urls = links.map((link) => link.uri).sort();
        const hash = digest(JSON.stringify({ text: document.text, urls }));
        const newLinks = links.filter((link) => !prior?.links.includes(link.uri));
        state[source.uri] = {
          ...prior,
          exposures:
            (prior?.exposures ?? 0) +
            (options.recordExposure === false || !newLinks.length ? 0 : 1),
          resultExposures:
            (prior?.resultExposures ?? 0) +
            (options.recordExposure === false || !newLinks.length ? 0 : 1),
          scans: (prior?.scans ?? 0) + 1,
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
    return { ...result(), sources };
  };
  return options.persist ? withWriter(root, run) : run();
}

/** Supplemental state failures are explicit gaps, never a reason to lose native research. */
export async function scanSourcesForResearch(
  settings: SearchSettings,
  root: string,
  options: Parameters<typeof scanSources>[2],
) {
  try {
    return {
      ...(await scanSources(settings, root, { ...options, recordExposure: false })),
      gaps: [] as string[],
    };
  } catch (error) {
    if (options?.signal?.aborted) throw error;
    return {
      sources: [],
      gaps: [
        `Followed source scan unavailable: ${error instanceof Error ? error.message : 'source_failed'}`,
      ],
      modelCalls: 0,
      kind: 'unassessed-source-scan',
      broadExploration: 'Native broad research remains available.',
    };
  }
}
