import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import {
  importPrivateDocument,
  listPrivateDocuments,
  readPrivatePdfBytes,
} from './private-documents.js';
import { createPrivateReader, revisePrivateReader } from './private-reader.js';
import type { openPrivateReader, selectPrivateReaderAnnotations } from './private-reader.js';
import { searchApi } from './search-api.js';

const roots: string[] = [];
const servers: Server[] = [];
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
async function root() {
  const path = await realpath(await mkdtemp(join(tmpdir(), 'signals-private-reader-')));
  roots.push(path);
  return path;
}
function pdf(texts: string[]) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${texts.map((_, index) => `${index * 2 + 3} 0 R`).join(' ')}] /Count ${texts.length} >>`,
    ...texts.flatMap((text, index) => [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${texts.length * 2 + 3} 0 R >> >> /Contents ${index * 2 + 4} 0 R >>`,
      `<< /Length ${Buffer.byteLength(`BT /F1 18 Tf 72 720 Td (${text}) Tj ET`)} >>\nstream\nBT /F1 18 Tf 72 720 Td (${text}) Tj ET\nendstream`,
    ]),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(body, 'latin1'));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(body, 'latin1');
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}
async function owner(rootPath: string) {
  const handler = searchApi(rootPath);
  const server = createServer((request, response) => {
    void handler(request, response).catch(() => {
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
  });
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('expected_loopback_address');
  const base = `http://127.0.0.1:${address.port}/signals-ai/__signals/api/`;
  const session = (await (await fetch(new URL('session', base))).json()) as { token: string };
  const scopeResponse = await fetch(new URL('request-scope', base), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-signals-token': session.token },
    body: '{}',
  });
  const scope = (await scopeResponse.json()) as { identity: string; epoch: string };
  const headers = {
    'content-type': 'application/json',
    'x-signals-token': session.token,
    'x-signals-provider-version': '1.0',
    'x-signals-instance-id': scope.identity,
    'x-signals-owner-epoch': scope.epoch,
  };
  return { base, headers, scope, server };
}
async function stop(server: Server) {
  if (server.listening)
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
}
afterEach(async () => {
  for (const server of servers.splice(0))
    if (server.listening)
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
  for (const path of roots.splice(0)) await rm(path, { recursive: true, force: true });
});

it('serves original bytes only for an exact PDF ref and freezes selected exact annotations', async () => {
  const workspace = await root();
  const bytes = pdf(['Page one: decoy', 'Page two: selected retention passage and canary nearby.']);
  const imported = await importPrivateDocument(workspace, {
    name: 'source.pdf',
    media_type: 'application/pdf',
    bytes_base64: bytes.toString('base64'),
  });
  let api = await owner(workspace);
  const post = (route: string, body: unknown) =>
    fetch(new URL(route, api.base), {
      method: 'POST',
      headers: api.headers,
      body: JSON.stringify(body),
    });
  const bytesRequest = { document_ref: imported.ref, raw_sha256: imported.document.raw_sha256 };
  const byteResponse = await post('private-reader/bytes', bytesRequest);
  expect(byteResponse.status).toBe(200);
  expect(byteResponse.headers.get('cache-control')).toContain('no-store');
  expect(byteResponse.headers.get('pragma')).toBe('no-cache');
  const byteReply = (await byteResponse.json()) as {
    bytes_base64: string;
    raw_sha256: string;
    page_count: number;
  };
  expect(Buffer.from(byteReply.bytes_base64, 'base64')).toEqual(bytes);
  expect(byteReply.raw_sha256).toBe(sha(bytes));
  expect(byteReply.page_count).toBe(2);
  expect((await listPrivateDocuments(workspace)).documents[0]).not.toHaveProperty('raw_base64');
  const unknownField = await post('private-reader/bytes', {
    ...bytesRequest,
    client_path: '/private/file.pdf',
  });
  expect(unknownField.status).toBe(400);
  expect(JSON.stringify(await unknownField.json())).not.toContain('bytes_base64');
  const publicOpen = await fetch(new URL(`private-documents/${imported.document.id}`, api.base), {
    headers: api.headers,
  });
  expect(publicOpen.status).toBe(200);
  expect(JSON.stringify(await publicOpen.json())).not.toContain('raw_base64');
  const textDoc = await importPrivateDocument(workspace, {
    name: 'ordinary.txt',
    media_type: 'text/plain',
    bytes_base64: Buffer.from('not a PDF').toString('base64'),
  });
  const wrongType = await post('private-reader/bytes', {
    document_ref: textDoc.ref,
    raw_sha256: textDoc.document.raw_sha256,
  });
  expect(wrongType.status).toBe(400);
  expect(JSON.stringify(await wrongType.json())).not.toContain('bytes_base64');
  await expect(
    readPrivatePdfBytes(workspace, { ...bytesRequest, raw_sha256: '0'.repeat(64) }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    readPrivatePdfBytes(workspace, { ...bytesRequest, surprise: 'path' }),
  ).rejects.toMatchObject({ status: 400 });

  const readerId = 'd22db7a3-56e4-48d0-85f1-ef1e15a6b2ea';
  const createResponse = await post('private-reader', {
    id: readerId,
    document_ref: imported.ref,
    raw_sha256: imported.document.raw_sha256,
    page: 2,
  });
  expect(createResponse.status).toBe(201);
  const created = (await createResponse.json()) as Awaited<ReturnType<typeof createPrivateReader>>;
  const retryResponse = await post('private-reader', {
    id: readerId,
    document_ref: imported.ref,
    raw_sha256: imported.document.raw_sha256,
    page: 2,
  });
  const retry = (await retryResponse.json()) as Awaited<ReturnType<typeof createPrivateReader>>;
  expect(retry.reader.digest).toBe(created.reader.digest);
  const page = created.document.pages[1]!;
  const quote = 'selected retention passage';
  const start = page.text.indexOf(quote);
  const reviseResponse = await post('private-reader/revise', {
    id: readerId,
    expected_revision: created.reader.revision,
    expected_digest: created.reader.digest,
    add_annotations: [
      {
        id: '632db7a3-56e4-48d0-85f1-ef1e15a6b2ea',
        page: 2,
        start,
        end: start + quote.length,
        quote,
        page_sha256: page.text_sha256,
        note: 'Review this clause',
      },
      {
        id: '732db7a3-56e4-48d0-85f1-ef1e15a6b2ea',
        page: 2,
        start: page.text.indexOf('canary'),
        end: page.text.indexOf('canary') + 6,
        quote: 'canary',
        page_sha256: page.text_sha256,
        note: 'Unselected private canary',
      },
    ],
  });
  expect(reviseResponse.status).toBe(200);
  const revised = (await reviseResponse.json()) as Awaited<ReturnType<typeof revisePrivateReader>>;
  expect(revised.reader.page).toBe(2);
  const reopenedResponse = await fetch(new URL(`private-reader/${readerId}`, api.base), {
    headers: api.headers,
  });
  const reopened = (await reopenedResponse.json()) as Awaited<ReturnType<typeof openPrivateReader>>;
  expect(reopened.reader.annotations[0]?.note).toBe('Review this clause');
  const staleCas = await post('private-reader/revise', {
    id: readerId,
    expected_revision: created.reader.revision,
    expected_digest: created.reader.digest,
    page: 1,
  });
  expect(staleCas.status).toBe(409);
  const selectedResponse = await post('private-reader/selection', {
    id: readerId,
    expected_revision: revised.reader.revision,
    expected_digest: revised.reader.digest,
    annotation_ids: ['632db7a3-56e4-48d0-85f1-ef1e15a6b2ea'],
  });
  expect(selectedResponse.status).toBe(200);
  const selected = (await selectedResponse.json()) as Awaited<
    ReturnType<typeof selectPrivateReaderAnnotations>
  >;
  expect(selected.sources).toHaveLength(1);
  expect(selected.sources[0]?.text).toBe(quote);
  expect(JSON.stringify(selected)).not.toContain('Unselected private canary');
  expect(selected.manifest).toMatchObject({
    raw_sha256: imported.document.raw_sha256,
    selections: [{ page: 2, start, end: start + quote.length, quote }],
  });
  expect(selected.sources[0]?.uri).toContain('range=');
  const movedResponse = await post('private-reader/revise', {
    id: readerId,
    expected_revision: revised.reader.revision,
    expected_digest: revised.reader.digest,
    page: 1,
  });
  const moved = (await movedResponse.json()) as Awaited<ReturnType<typeof revisePrivateReader>>;
  expect(moved.reader.page).toBe(1);
  const reopenedRetryResponse = await post('private-reader', {
    id: readerId,
    document_ref: imported.ref,
    raw_sha256: imported.document.raw_sha256,
    page: 2,
  });
  const reopenedRetry = (await reopenedRetryResponse.json()) as Awaited<
    ReturnType<typeof createPrivateReader>
  >;
  expect(reopenedRetry.reader.page).toBe(1);
  const changedCreate = await post('private-reader', {
    id: readerId,
    document_ref: imported.ref,
    raw_sha256: imported.document.raw_sha256,
    page: 1,
  });
  expect(changedCreate.status).toBe(409);

  const wrongHash = await post('private-reader/bytes', {
    ...bytesRequest,
    raw_sha256: '0'.repeat(64),
  });
  expect(wrongHash.status).toBe(409);
  const wrongRef = await post('private-reader/bytes', {
    document_ref: {
      ...imported.ref,
      digest: '0'.repeat(64),
      revision: `sha256:${'0'.repeat(64)}`,
    },
    raw_sha256: imported.document.raw_sha256,
  });
  expect(wrongRef.status).toBe(409);
  const noToken = await fetch(new URL('private-reader/bytes', api.base), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(bytesRequest),
  });
  expect(noToken.status).toBe(403);
  const wrongOrigin = await fetch(new URL('private-reader/bytes', api.base), {
    method: 'POST',
    headers: { ...api.headers, origin: 'http://evil.example' },
    body: JSON.stringify(bytesRequest),
  });
  expect(wrongOrigin.status).toBe(403);
  const wrongEpoch = await fetch(new URL('private-reader/bytes', api.base), {
    method: 'POST',
    headers: { ...api.headers, 'x-signals-owner-epoch': 'stale' },
    body: JSON.stringify(bytesRequest),
  });
  expect(wrongEpoch.status).toBe(409);
  expect(api.scope.epoch).not.toBe('stale');
  await stop(api.server);
  api = await owner(workspace);
  const afterRestart = await fetch(new URL(`private-reader/${readerId}`, api.base), {
    headers: api.headers,
  });
  expect(afterRestart.status).toBe(200);
  const restored = (await afterRestart.json()) as Awaited<ReturnType<typeof openPrivateReader>>;
  expect(restored.reader.page).toBe(1);
  expect(restored.reader.annotations[0]?.quote).toBe(quote);
  expect(restored.reader.annotations[0]?.note).toBe('Review this clause');
});

it('refuses non-PDF bytes and code-point-splitting offsets', async () => {
  const workspace = await root();
  const textDoc = await importPrivateDocument(workspace, {
    name: 'ordinary.txt',
    media_type: 'text/plain',
    bytes_base64: Buffer.from('not a PDF').toString('base64'),
  });
  await expect(
    readPrivatePdfBytes(workspace, {
      document_ref: textDoc.ref,
      raw_sha256: textDoc.document.raw_sha256,
    }),
  ).rejects.toMatchObject({ status: 400 });

  const pdfDoc = await importPrivateDocument(workspace, {
    name: 'unicode.pdf',
    media_type: 'application/pdf',
    bytes_base64: pdf(['Page one', 'Unicode page']).toString('base64'),
  });
  const storePath = join(workspace, '.signals/private-documents.json');
  const store = JSON.parse(await readFile(storePath, 'utf8')) as {
    documents: Array<{
      id: string;
      pages: Array<{ text: string; text_sha256: string }>;
      record_sha256: string;
      [key: string]: unknown;
    }>;
  };
  const record = store.documents.find((row) => row.id === pdfDoc.document.id)!;
  const text = 'A😀B';
  const secondPage = record.pages[1];
  if (!secondPage) throw new Error('synthetic_pdf_page_missing');
  secondPage.text = text;
  secondPage.text_sha256 = sha(text);
  const projection: Record<string, unknown> = { ...record };
  delete projection.record_sha256;
  record.record_sha256 = sha(JSON.stringify(projection));
  await writeFile(storePath, JSON.stringify(store, null, 2) + '\n');
  const refs = await listPrivateDocuments(workspace);
  const ref = refs.documents.find((row) => row.ref.id === pdfDoc.document.id)!.ref;
  const reader = await createPrivateReader(workspace, {
    id: '832db7a3-56e4-48d0-85f1-ef1e15a6b2ea',
    document_ref: ref,
    raw_sha256: pdfDoc.document.raw_sha256,
    page: 2,
  });
  await expect(
    revisePrivateReader(workspace, {
      id: reader.reader.id,
      expected_revision: reader.reader.revision,
      expected_digest: reader.reader.digest,
      add_annotations: [
        {
          id: '932db7a3-56e4-48d0-85f1-ef1e15a6b2ea',
          page: 2,
          start: 1,
          end: 2,
          quote: '\uD83D',
          page_sha256: sha(text),
          note: '',
        },
      ],
    }),
  ).rejects.toMatchObject({ status: 400 });
});
