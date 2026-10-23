import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { importPrivateDocument, listPrivateDocuments } from './private-documents.js';
import {
  listPrivateCollection,
  openPrivateCollection,
  previewPrivateCollection,
  selectPrivateCollection,
} from './private-collection.js';

const roots: string[] = [];
async function root() {
  const path = await realpath(await mkdtemp(join(tmpdir(), 'signals-private-collection-')));
  roots.push(path);
  return path;
}
afterEach(async () => {
  for (const path of roots.splice(0)) await rm(path, { recursive: true, force: true });
});
const id = 'a4bb329b-6464-47b4-8f6a-ae98c12294cd';

it('searches every chosen source, reopens immutably and exports only selected snippets', async () => {
  const workspace = await root();
  const a = await importPrivateDocument(workspace, {
    name: 'retention-seven.txt', media_type: 'text/plain',
    bytes_base64: Buffer.from('Backups retain records for seven days.').toString('base64'),
  });
  const b = await importPrivateDocument(workspace, {
    name: 'retention-thirty.txt', media_type: 'text/plain',
    bytes_base64: Buffer.from('Backups retain records for thirty days.').toString('base64'),
  });
  await importPrivateDocument(workspace, {
    name: 'private-canary.txt', media_type: 'text/plain',
    bytes_base64: Buffer.from('private canary not selected').toString('base64'),
  });
  const docs = await listPrivateDocuments(workspace);
  const refs = [a.ref, b.ref];
  expect(docs.documents).toHaveLength(3);
  const request = { id, query: 'backup retention days', document_refs: refs, max_candidates: 24 };
  const preview = await previewPrivateCollection(workspace, request);
  expect(preview.state).toBe('matched');
  expect(new Set(preview.candidates.map((row) => row.name))).toEqual(new Set(['retention-seven.txt', 'retention-thirty.txt']));
  expect((await openPrivateCollection(workspace, id)).preview_digest).toBe(preview.preview_digest);
  expect((await listPrivateCollection(workspace)).previews).toHaveLength(1);
  await expect(previewPrivateCollection(workspace, { ...request, query: 'retention days' })).rejects.toMatchObject({ status: 409 });

  const chosen = preview.candidates.find((row) => row.name === 'retention-thirty.txt')!;
  const exported = await selectPrivateCollection(workspace, {
    query_id: id, preview_digest: preview.preview_digest, candidate_ids: [chosen.id],
  }, 'http://127.0.0.1:5178');
  expect(exported.sources).toHaveLength(1);
  expect(exported.sources[0]?.text).toBe('Backups retain records for thirty days.');
  expect(JSON.stringify(exported)).not.toContain('private canary');
  expect(exported.manifest[0]).toMatchObject({ document_ref: b.ref, page: 1, start: 0, end: 40 });
  await expect(selectPrivateCollection(workspace, {
    query_id: id, preview_digest: preview.preview_digest, candidate_ids: ['f'.repeat(64)],
  }, 'http://127.0.0.1:5178')).rejects.toMatchObject({ status: 400 });
});

it('keeps no-match explicit and refuses a changed backing extraction on reopen', async () => {
  const workspace = await root();
  const doc = await importPrivateDocument(workspace, {
    name: 'one.txt', media_type: 'text/plain',
    bytes_base64: Buffer.from('The source says nothing about the query.').toString('base64'),
  });
  const noMatch = await previewPrivateCollection(workspace, {
    id, query: 'xylophone', document_refs: [doc.ref],
  });
  expect(noMatch.state).toBe('no_match');
  expect(noMatch.candidates).toEqual([]);
  const path = join(workspace, '.signals/private-documents.json');
  const store = JSON.parse(await readFile(path, 'utf8')) as { documents: Array<{ name: string }> };
  store.documents[0]!.name = 'tampered.txt';
  await writeFile(path, JSON.stringify(store));
  await expect(openPrivateCollection(workspace, id)).rejects.toMatchObject({ status: 503 });
});
