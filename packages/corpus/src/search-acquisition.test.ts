import { expect, it } from 'vitest';
import { acquireConfigured, normalizeAcquisition } from './search-acquisition.js';
it('isolates schema drift and unsafe items without dropping valid provider candidates', () => {
  const result = normalizeAcquisition(
    {
      schema_version: '1.3',
      source_status: { reddit: 'denied' },
      results: [
        {
          url: 'https://example.com/tool',
          title: 'Tool',
          relevance_score: 1,
          engagement: { points: 500 },
        },
        { url: 'https://127.0.0.1/private', title: 'Private' },
        { title: 'Missing' },
      ],
    },
    'last30days',
  );
  expect(result.hits).toHaveLength(1);
  expect(result.hits[0]).not.toHaveProperty('relevance_score');
  expect(result.gaps).toHaveLength(3);
  expect(() => normalizeAcquisition({ schema_version: '2.0', results: [] }, 'last30days')).toThrow(
    'unsupported_last30days_schema',
  );
});
it('uses configured JSON search without treating engine multiplicity as independent support', async () => {
  const result = await acquireConfigured(
    { query: 'portable source traces' },
    { searxng: 'https://search.example.com/search' },
    undefined,
    async (uri) => ({
      uri,
      text: '',
      digest: 'a'.repeat(64),
      json: { results: [{ url: 'https://example.com/tool', title: 'Tool', engines: ['a', 'b'] }] },
    }),
  );
  expect(result.hits).toHaveLength(1);
  expect(result.searches).toBe(1);
  expect(result.modelCalls).toBe(0);
  const failure = await acquireConfigured(
    { query: 'query' },
    { searxng: 'https://example.com' },
    undefined,
    async () => {
      throw new Error('source_denied_403');
    },
  );
  expect(failure.gaps).toEqual(['searxng: source_denied_403']);
});
