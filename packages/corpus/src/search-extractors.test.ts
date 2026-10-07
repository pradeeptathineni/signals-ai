import { expect, it } from 'vitest';
import {
  jinaDocument,
  configuredDocumentFetch,
  normalizeDocling,
  doclingDocument,
} from './search-extractors.js';
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
it('keeps Docling page/table locators and negation, failing closed before unauthorized models', async () => {
  const material = normalizeDocling({
    schema_version: 1,
    text: 'Local does not guarantee privacy.\n|Tool|Local|\n|A|No|',
    sections: [
      {
        locator: '#/tables/0',
        text: '|Tool|Local|\n|A|No|',
        provenance: [{ page: 2, bbox: { l: 10, t: 50 } }],
      },
    ],
  });
  expect(material.text).toContain('does not');
  expect(material.sections[0]?.provenance).toEqual([{ page: 2, bbox: { l: 10, t: 50 } }]);
  await expect(
    doclingDocument('https://example.com/paper.pdf', {
      python: '/missing/python3',
      artifactsPath: '/missing/artifacts',
      modelsAuthorized: false,
      version: '2.135.0',
    }),
  ).rejects.toThrow('models_not_authorized');
  expect(() => normalizeDocling({ schema_version: 2, text: 'Snippet', sections: [] })).toThrow(
    'invalid_docling_document',
  );
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
