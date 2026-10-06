import { it, expect } from 'vitest';
import { directSearch } from './search-direct.js';

it('uses bounded ranked locators without inference, crawling or trusting returned private URLs', async () => {
  const calls: string[] = [];
  const result = await directSearch(
    {
      query: 'model context protocol',
      sources: ['github', 'hacker-news'],
      supplementalSites: ['https://github.com/example'],
    },
    undefined,
    async (uri) => {
      calls.push(uri);
      return {
        uri,
        text: '',
        digest: 'a'.repeat(64),
        json: uri.includes('github')
          ? {
              items: [
                {
                  html_url: 'https://github.com/example/tool',
                  url: 'https://api.github.com/repos/example/tool',
                  full_name: 'example/tool',
                  stargazers_count: 1200,
                },
                {
                  html_url: 'https://github.com/other/tool',
                  url: 'https://api.github.com/repos/other/tool',
                },
                {
                  html_url: 'https://127.0.0.1/tool',
                  url: 'https://api.github.com/repos/example/unsafe',
                },
              ],
            }
          : { hits: [] },
      };
    },
  );
  expect(calls).toHaveLength(2);
  expect(new URL(calls[0]!).searchParams.get('q')).toBe('model context protocol user:example');
  expect(result.modelCalls).toBe(0);
  expect(result.hits).toHaveLength(1);
  expect(result.hits[0]!.popularity.stars).toBe(1200);
  expect(result.kind).toBe('unassessed-source-hits');
  expect(result.gaps).toContain('github: unsafe or malformed result omitted');
});

it('retrieves general concepts through ranked Wikipedia locators without granting authority to rank or snippets', async () => {
  const calls: string[] = [];
  const result = await directSearch(
    { query: 'accessibility', sources: ['open-web'] },
    undefined,
    async (uri) => {
      calls.push(uri);
      return {
        uri,
        text: '',
        digest: 'a'.repeat(64),
        json: {
          query: {
            search: [
              {
                title: 'Web accessibility',
                pageid: 42,
                snippet: '<span>Accessibility</span> &quot;guide&quot;',
              },
              { title: 'Unsafe missing identity' },
            ],
          },
        },
      };
    },
  );
  expect(calls).toHaveLength(1);
  expect(new URL(calls[0]!).searchParams.get('srsearch')).toBe('accessibility');
  expect(new URL(calls[0]!).searchParams.get('srlimit')).toBe('5');
  expect(result.hits).toEqual([
    expect.objectContaining({
      provider: 'wikipedia',
      rank: 1,
      uri: 'https://en.wikipedia.org/wiki/Web_accessibility',
      summary: 'Accessibility "guide"',
      popularity: {},
    }),
  ]);
  expect(result.gaps).toContain('wikipedia: malformed result omitted');
  expect(result.modelCalls).toBe(0);
  const scoped = await directSearch(
    {
      query: 'accessibility',
      sources: ['open-web'],
      supplementalSites: ['https://en.wikipedia.org/wiki/Web_accessibility'],
    },
    undefined,
    async () => {
      throw new Error('must not fetch');
    },
  );
  expect(scoped.searches).toBe(0);
  expect(scoped.gaps).toContain(
    'wikipedia: path-scoped direct search unavailable; use scoped broad search',
  );
});

it('honors disabled source families and refuses unsupported direct path scopes', async () => {
  let calls = 0;
  const fetch = async (uri: string) => {
    calls++;
    return { uri, text: '', digest: 'a'.repeat(64), json: { hits: [] } };
  };
  expect(
    (await directSearch({ query: 'private interest', sources: ['primary'] }, undefined, fetch))
      .searches,
  ).toBe(0);
  const scoped = await directSearch(
    {
      query: 'question',
      sources: ['hacker-news'],
      supplementalSites: ['https://news.ycombinator.com/item'],
    },
    undefined,
    fetch,
  );
  expect(calls).toBe(0);
  expect(scoped.gaps).toContain(
    'hacker-news: path-scoped direct search unavailable; use scoped broad search',
  );
});

it('reports denied providers once and stops subsequent calls on cancellation', async () => {
  const controller = new AbortController();
  let calls = 0;
  const result = await directSearch({ query: 'something' }, controller.signal, async () => {
    calls++;
    controller.abort();
    throw new Error('source_denied_403');
  });
  expect(calls).toBe(1);
  expect(result.gaps).toEqual(['github: source_denied_403', 'cancelled']);
  expect(result.hits).toEqual([]);
});
