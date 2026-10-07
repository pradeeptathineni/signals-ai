import { expect, it } from 'vitest';
import { jinaDocument, configuredDocumentFetch } from './search-extractors.js';
it('validates target before hosted dispatch and never uses a reader to bypass denied access', async () => {
  let called = false;
  await expect(
    jinaDocument('https://127.0.0.1', undefined, {
      validate: async () => {
        throw new Error('private_target_denied');
      },
      fetch: async () => {
        called = true;
        throw new Error('unexpected');
      },
    }),
  ).rejects.toThrow('private_target_denied');
  expect(called).toBe(false);
  await expect(
    configuredDocumentFetch(true, async () => {
      throw new Error('source_denied_403');
    })('https://example.com'),
  ).rejects.toThrow('source_denied_403');
});
it('preserves provider uncertainty and publication uncertainty rather than claiming original bytes', async () => {
  const result = await jinaDocument('https://example.com', undefined, {
    validate: async () => ({
      url: new URL('https://example.com'),
      address: { address: '93.184.216.34', family: 4 },
    }),
    fetch: async (uri) => ({
      uri,
      text: 'Title: Public page\nContent: short extracted text',
      digest: 'a'.repeat(64),
    }),
  });
  expect(result.identityUnverified).toBe(true);
  expect(result.material.publishedAt).toBeNull();
  expect(result.material.extractor).toBe('jina-reader-hosted');
});
