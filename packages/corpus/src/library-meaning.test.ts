import { expect, it } from 'vitest';
import { projectNativeLibrary, createLibraryIndex } from '../../domain/src/library-search.js';
import { loadEntities } from './search-store.js';
import { matchLibrary } from './library-meaning.js';
import type { SearchRunner } from './search-runner.js';

it('recovers paraphrases outside literal hits and hydrates unchanged records with qualified identities', async () => {
  const [record] = await loadEntities();
  const finding = {
    ...projectNativeLibrary(record!, 'private'),
    title: 'Orchid',
    description: 'Coordinates autonomous workers through a visual control console',
    capabilities: [],
    tags: [],
    notes: 'PRIVATE NOTE NEVER IN MATCHING METADATA',
  };
  const query = 'that impressive agentic system with a dashboard';
  const literal = createLibraryIndex([finding]).search(query);
  expect(literal).toHaveLength(0);
  let calls = 0;
  const runner: SearchRunner = {
    readiness: async () => ({
      available: true,
      broadSearch: false,
      runner: 'fixture',
      reason: 'No model invoked',
    }),
    discover: async (request) => {
      calls++;
      expect(request).toMatchObject({ save: 'never', cache: 'memory' });
      return {
        proposal: {
          matches: [
            { key: finding.key, reason: 'Fixture paraphrase of visual worker coordination' },
          ],
        },
        usage: null,
        searches: 0,
      };
    },
  };
  const matched = await matchLibrary([finding], query, {}, { permitted: true, runner });
  expect(calls).toBe(1);
  expect(matched.state).toBe('completed');
  expect(matched.hits[0]!.finding).toBe(finding);
  expect(matched.hits[0]!.finding.native).toBe(record!.entity);
  expect(matched.hits[0]!.retrievalScore).toBe(0);
});

it('denies inference, forged identities, scope escapes and cancellation while retaining literal fallback', async () => {
  const [record] = await loadEntities();
  const finding = projectNativeLibrary(record!, 'private');
  let calls = 0;
  const runner: SearchRunner = {
    readiness: async () => ({ available: true, broadSearch: false, runner: 'fixture', reason: '' }),
    discover: async () => {
      calls++;
      return {
        proposal: { matches: [{ key: 'native:public:forged', reason: 'invented' }] },
        usage: null,
        searches: 0,
      };
    },
  };
  expect(
    (await matchLibrary([finding], finding.title, {}, { permitted: false, runner })).state,
  ).toBe('disabled');
  expect(calls).toBe(0);
  expect(
    (
      await matchLibrary(
        [finding],
        finding.title,
        { destination: 'public' },
        { permitted: true, runner },
      )
    ).hits,
  ).toEqual([]);
  expect(calls).toBe(0);
  const forged = await matchLibrary([finding], finding.title, {}, { permitted: true, runner });
  expect(forged.state).toBe('unavailable');
  expect(forged.hits[0]!.finding.key).toBe(finding.key);
  const controller = new AbortController();
  controller.abort();
  expect(
    (
      await matchLibrary(
        [finding],
        finding.title,
        {},
        { permitted: true, runner, signal: controller.signal },
      )
    ).state,
  ).toBe('cancelled');
  expect(calls).toBe(1);
});
