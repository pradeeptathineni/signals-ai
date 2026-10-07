import { it, expect } from 'vitest';
import { mkdtemp, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanSources } from './search-sources.js';
import { defaultSettings } from './search-settings.js';
it('keeps source exposures/opportunities and missing feedback, emitting additions only once', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'sources-test-')));
  const settings = {
    ...defaultSettings,
    followedSources: [
      { uri: 'https://example.com/feed', label: 'A scout', enabled: true, interests: [] },
    ],
  };
  let changed = false;
  const fetch = async (uri: string) => ({
    uri,
    digest: 'a'.repeat(64),
    text: 'Same content',
    material: {
      text: 'Same content',
      title: 'Scout',
      author: null,
      publishedAt: null,
      links: [
        { uri: 'https://example.com/tool', title: 'A' },
        ...(changed ? [{ uri: 'https://other.example.org/next', title: 'B' }] : []),
      ],
      sections: [],
      extractor: 'fixture',
    },
  });
  try {
    expect(
      (await scanSources(settings, root, { persist: true, fetch })).sources[0]?.newLinks,
    ).toHaveLength(1);
    const unchanged = (await scanSources(settings, root, { persist: true, fetch })).sources[0]!;
    expect(unchanged.delta).toBe('unchanged');
    expect(unchanged.newLinks).toHaveLength(0);
    expect(unchanged.health?.exposures).toBe(2);
    expect(unchanged.health?.feedback).toBeNull();
    changed = true;
    const next = (await scanSources(settings, root, { persist: true, fetch })).sources[0]!;
    expect(next.newLinks).toHaveLength(1);
    expect(next.health?.opportunities).toBe(2);
    const failed = await scanSources(settings, root, {
      persist: true,
      fetch: async () => {
        throw new Error('source_denied_403');
      },
    });
    expect(failed.sources[0]?.state).toBe('failed');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
