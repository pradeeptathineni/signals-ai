import { describe, it, expect } from 'vitest';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nativeProposal } from '../../domain/src/search-native.js';
import { acceptDiscovery, signalSearch } from './signal-search.js';
import type { SearchRunner } from './search-runner.js';

const brief = () => ({
  version: 1,
  sources: [
    {
      uri: 'https://example.org/guide',
      title: 'Guide',
      publisher: 'Author',
      family: 'primary',
      publishedAt: null,
      origin: 'author',
    },
    {
      uri: 'https://example.org/unread',
      title: 'Uninspected locator',
      publisher: 'Author',
      family: 'primary',
      publishedAt: null,
      origin: 'author',
    },
  ],
  candidates: [
    {
      uri: 'https://example.org/guide',
      name: 'Guide',
      kind: 'learning-resource',
      identity: 'resolved',
      description: 'A portable guide.',
      capabilities: ['portable notes'],
      match: { level: 'direct', reason: 'Addresses portable notes.', sources: [0] },
      limits: ['No independent use demonstrated.'],
      observations: [
        {
          source: 0,
          feature: 'defining',
          indicator: 'defines',
          statement: 'Provides a portable guide.',
          quote: 'portable guide',
          independent: false,
          origin: 'author',
          status: 'supported',
        },
      ],
    },
  ],
  coverage: [],
  gaps: [],
});
describe('native brief kernel boundary', () => {
  it('encodes only existing valid signal pairs and projects version 2 identically', () => {
    const old = brief();
    const current = {
      ...old,
      version: 2,
      candidates: old.candidates.map((candidate) => ({
        ...candidate,
        observations: candidate.observations.map(({ feature, indicator, ...fact }) => ({
          ...fact,
          signal: `${feature}/${indicator}`,
        })),
      })),
    };
    expect(nativeProposal(current)).toEqual(nativeProposal(old));
    current.candidates[0]!.observations[0]!.signal = 'verification/documented';
    expect(() => nativeProposal(current)).toThrow('invalid_native_brief');
  });
  it('keeps missing facets/dimensions unknown and rejects invalid binding vocabulary', () => {
    const proposal = nativeProposal(brief());
    expect(proposal.candidates[0]!.facets.domains).toEqual([]);
    expect(proposal.candidates[0]!.observations).toHaveLength(1);
    const invalid = brief();
    invalid.candidates[0]!.observations[0]!.indicator = 'broad';
    expect(() => nativeProposal(invalid)).toThrow('invalid_native_brief');
    const unbound = brief();
    unbound.candidates[0]!.observations[0]!.source = 11;
    expect(() => nativeProposal(unbound)).toThrow('invalid_evidence_binding');
  });
  it('checks claimed facts while transparently deferring unused source locators', async () => {
    const fetched: string[] = [];
    const result = await acceptDiscovery(
      nativeProposal(brief()),
      { query: 'Portable notes', route: 'native' },
      {
        fetch: async (uri) => {
          fetched.push(uri);
          return { uri, text: 'A portable guide for notes.', digest: 'a'.repeat(64) };
        },
      },
    );
    expect(fetched).toEqual(['https://example.org/guide']);
    expect(result.sources[1]!.reason).toBe('native_inspection_deferred');
    expect(result.items[0]!.eligible).toBe(false);
  });
  it('emits unsavable provisional leads before verification, makes no second session or memory writes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'signals-native-test-'));
    try {
      const events: string[] = [];
      const runner: SearchRunner = {
        readiness: async () => ({
          available: true,
          broadSearch: true,
          runner: 'fixture',
          reason: 'fixture',
        }),
        discover: async () => ({ proposal: nativeProposal(brief()), usage: null, searches: 1 }),
        enrich: async () => {
          throw new Error('second_session');
        },
      };
      const result = await signalSearch(
        { query: 'Portable notes', route: 'native', cache: 'memory', save: 'never' },
        {
          root,
          runner,
          provisional: (leads) => {
            events.push('provisional');
            expect(Object.keys(leads[0]!)).toEqual(['uri', 'name', 'description', 'limits']);
          },
          fetch: async (uri) => {
            events.push('fetch');
            return { uri, text: 'A portable guide for notes.', digest: 'a'.repeat(64) };
          },
        },
      );
      expect(events).toEqual(['provisional', 'fetch']);
      expect(result.usage.modelCalls).toBe(1);
      expect(result.usage.stages?.firstValidatedMs).toBeGreaterThanOrEqual(
        result.usage.stages!.answerReadyMs,
      );
      expect(await readdir(root)).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
