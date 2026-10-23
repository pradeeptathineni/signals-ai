import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { afterEach, expect, it } from 'vitest';
import { researchQuestion } from '@pradeeptathineni/research-ai';
import {
  importPrivateDocument,
  listPrivateDocuments,
  openPrivateDocument,
  selectPrivateDocument,
} from './private-documents.js';
import { searchApi } from './search-api.js';

const roots: string[] = [];
const servers: Server[] = [];
async function privateRoot() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'signals-private-documents-')));
  roots.push(root);
  return root;
}
function pdf(texts: string[], padding = '') {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${texts.map((_, index) => `${index * 2 + 3} 0 R`).join(' ')}] /Count ${texts.length} >>`,
    ...texts.flatMap((text, index) => [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${texts.length * 2 + 3} 0 R >> >> /Contents ${index * 2 + 4} 0 R >>`,
      `<< /Length ${Buffer.byteLength(`BT /F1 18 Tf 72 720 Td (${text}) Tj ET`)} >>\nstream\nBT /F1 18 Tf 72 720 Td (${text}) Tj ET\nendstream`,
    ]),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = `%PDF-1.4\n${padding}`;
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
function encoded(bytes: Buffer) {
  return {
    name: 'folders/source.pdf',
    media_type: 'application/pdf' as const,
    bytes_base64: bytes.toString('base64'),
  };
}
async function serverFor(root: string) {
  const handler = searchApi(root);
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
  if (!address || typeof address === 'string') throw new Error('expected_ephemeral_loopback_port');
  const base = `http://127.0.0.1:${address.port}/signals-ai/__signals/api/`;
  const session = (await (await fetch(new URL('session', base))).json()) as { token: string };
  const init = await fetch(new URL('request-scope', base), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-signals-token': session.token },
    body: '{}',
  });
  const scope = (await init.json()) as { identity: string; epoch: string };
  return {
    base,
    headers: {
      'content-type': 'application/json',
      'x-signals-provider-version': '1.0',
      'x-signals-instance-id': scope.identity,
      'x-signals-owner-epoch': scope.epoch,
      'x-signals-token': session.token,
    },
  };
}
afterEach(async () => {
  for (const server of servers.splice(0))
    if (server.listening)
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

it('imports a real two-page text PDF, reopens exact page digests and freezes only page two for replay Research', async () => {
  const root = await privateRoot();
  const bin = join(root, 'bin');
  await mkdir(bin);
  const invocations = join(root, 'codex-executions');
  const promptPath = join(root, 'frozen-prompt.json');
  const fake = join(bin, 'codex');
  const previousPath = process.env.PATH;
  await writeFile(
    fake,
    `#!/bin/sh
if [ "$1" = --version ]; then printf '%s\\n' 'codex-cli 0.160.0'; exit 0; fi
if [ "$1" = login ]; then printf '%s\\n' 'Logged in'; exit 0; fi
if [ "$1" = exec ] && [ "$2" = --help ]; then printf '%s\\n' 'Usage: codex exec --ignore-user-config --ignore-rules --ephemeral --skip-git-repo-check --sandbox --json --output-schema --cd --model --config'; exit 0; fi
if [ "$1" = exec ]; then printf '%s\\n' exec >> '${invocations}'; cat > '${promptPath}'; printf '%s\\n' '{"type":"item.completed","item":{"type":"agent_message","text":"Replay provider answered from supplied frozen text."}}'; printf '%s\\n' '{"type":"turn.completed"}'; exit 0; fi
exit 1
`,
    { mode: 0o700 },
  );
  process.env.PATH = `${bin}:${previousPath ?? ''}`;
  try {
    const bytes = pdf(['Page one: alpha', 'Page two: beta']);
    const imported = await importPrivateDocument(root, encoded(bytes));
    expect(imported.document.pages.map((page) => page.text)).toEqual([
      'Page one: alpha',
      'Page two: beta',
    ]);
    expect(imported.document.raw_sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(imported.document.pages[0]!.text_sha256).not.toBe(
      imported.document.pages[1]!.text_sha256,
    );
    await expect(readFile(invocations, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    const listed = await listPrivateDocuments(root);
    expect(listed.documents[0]).not.toHaveProperty('pages');
    expect(listed.documents[0]).not.toHaveProperty('raw_base64');
    const reopened = await openPrivateDocument(root, imported.document.id);
    expect(reopened.ref).toEqual(imported.ref);
    const selected = await selectPrivateDocument(
      root,
      { document_ref: reopened.ref, pages: [2] },
      'http://127.0.0.1:5178',
    );
    expect(selected.pages).toEqual([2]);
    expect(selected.sources).toHaveLength(1);
    expect(selected.sources[0]).toMatchObject({
      uri: `http://127.0.0.1:5178/signals-ai/__signals/api/private-documents/${imported.document.id}/pages/2`,
      text: 'Page two: beta',
      observedAt: imported.document.imported_at,
    });
    const result = await researchQuestion('What does the selected page say?', {
      sources: selected.sources,
      model: 'fixture-model',
      effort: 'low',
      lease: join(root, 'research-lease'),
    });
    expect(result.status).toBe('complete');
    expect(result.receipt).toMatchObject({
      mode: 'frozen',
      source: [
        {
          uri: selected.sources[0]!.uri,
          sha256: createHash('sha256').update(selected.sources[0]!.text, 'utf8').digest('hex'),
        },
      ],
    });
    const prompt = await readFile(promptPath, 'utf8');
    expect(prompt).toContain('Page two: beta');
    expect(prompt).not.toContain('Page one: alpha');
  } finally {
    process.env.PATH = previousPath;
  }
});

it('keeps HTML inert and preserves Markdown Unicode', async () => {
  const root = await privateRoot();
  const html = await importPrivateDocument(root, {
    name: 'page.html',
    media_type: 'text/html',
    bytes_base64: Buffer.from(
      '<html><body><main><p>Visible Ω</p><script>PRIVATE_SCRIPT_SENTINEL</script></main></body></html>',
    ).toString('base64'),
  });
  expect(html.document.pages[0]!.text).toContain('Visible Ω');
  expect(html.document.pages[0]!.text).not.toContain('PRIVATE_SCRIPT_SENTINEL');
  const markdown = await importPrivateDocument(root, {
    name: 'notes.md',
    media_type: 'text/markdown',
    bytes_base64: Buffer.from('# Résumé 😀\n').toString('base64'),
  });
  expect(markdown.document.pages[0]!.text).toBe('# Résumé 😀\n');
});

it('refuses malformed, encrypted, image-only, oversized and unavailable-parser PDFs', async () => {
  const root = await privateRoot();
  await expect(
    importPrivateDocument(root, encoded(Buffer.from('%PDF-1.4\nnot a pdf'))),
  ).rejects.toMatchObject({ code: 'pdf_malformed_or_unsupported' });
  const python = process.env.PYTHON ?? 'python3';
  const encrypted = execFileSync(python, [
    '-c',
    'import io,sys\nfrom pypdf import PdfWriter\nw=PdfWriter(); w.add_blank_page(width=72,height=72); w.encrypt(""); b=io.BytesIO(); w.write(b); sys.stdout.buffer.write(b.getvalue())',
  ]);
  await expect(importPrivateDocument(root, encoded(encrypted))).rejects.toMatchObject({
    code: 'pdf_encrypted',
  });
  await expect(importPrivateDocument(root, encoded(pdf([''])))).rejects.toMatchObject({
    code: 'invalid_private_document',
  });
  await expect(
    importPrivateDocument(root, encoded(pdf(['Text'], `%${'x'.repeat(130_000)}\n`))),
  ).resolves.toMatchObject({ document: { pages: [{ text: 'Text' }] } });
  await expect(
    importPrivateDocument(root, {
      name: 'large',
      media_type: 'text/plain',
      bytes_base64: Buffer.alloc(4 * 1024 * 1024 + 1).toString('base64'),
    }),
  ).rejects.toMatchObject({ code: 'invalid_private_document' });
  await expect(
    importPrivateDocument(root, encoded(pdf(['Text'])), { python: join(root, 'missing-python') }),
  ).rejects.toMatchObject({ code: 'pdf_parser_unavailable' });
});

it('rejects rehashed inconsistent private state and stale exact document refs', async () => {
  const root = await privateRoot();
  const imported = await importPrivateDocument(root, {
    name: 'notes.txt',
    media_type: 'text/plain',
    bytes_base64: Buffer.from('original text').toString('base64'),
  });
  const path = join(root, '.signals/private-documents.json');
  const stored = JSON.parse(await readFile(path, 'utf8')) as {
    documents: Array<Record<string, unknown>>;
  };
  const record = stored.documents[0]!;
  const page = (record.pages as Array<Record<string, unknown>>)[0]!;
  page.text = 'changed text';
  page.text_sha256 = createHash('sha256').update('changed text').digest('hex');
  await writeFile(path, JSON.stringify(stored));
  await expect(openPrivateDocument(root, imported.document.id)).rejects.toMatchObject({
    code: 'private_document_unavailable',
  });
});

it('guards bounded import, exact page reads, query fields, token and owner origin over loopback HTTP', async () => {
  const root = await privateRoot();
  const api = await serverFor(root);
  const unauthenticated = await fetch(new URL('private-documents', api.base), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'x', media_type: 'text/plain', bytes_base64: 'eA==' }),
  });
  expect(unauthenticated.status).toBe(403);
  const pathImport = await fetch(new URL('private-documents', api.base), {
    method: 'POST',
    headers: api.headers,
    body: JSON.stringify({
      name: 'notes.txt',
      media_type: 'text/plain',
      bytes_base64: Buffer.from('text').toString('base64'),
      path: '/etc/passwd',
    }),
  });
  expect(pathImport.status).toBe(400);
  const importResponse = await fetch(new URL('private-documents', api.base), {
    method: 'POST',
    headers: api.headers,
    body: JSON.stringify(encoded(pdf(['Page one', 'Page two'], `%${'x'.repeat(130_000)}\n`))),
  });
  expect(importResponse.status).toBe(201);
  const imported = (await importResponse.json()) as {
    ref: { id: string };
    document: { pages: Array<{ text_sha256: string }> };
  };
  const list = await fetch(new URL('private-documents', api.base), { headers: api.headers });
  expect(list.status).toBe(200);
  const page = await fetch(new URL(`private-documents/${imported.ref.id}/pages/2`, api.base), {
    headers: api.headers,
  });
  expect(page.status).toBe(200);
  expect(await page.json()).toMatchObject({
    document_ref: imported.ref,
    page: { number: 2, text: 'Page two' },
  });
  const extraQuery = await fetch(
    new URL(`private-documents/${imported.ref.id}?path=/etc/passwd`, api.base),
    { headers: api.headers },
  );
  expect(extraQuery.status).toBe(400);
  const wrongOrigin = await fetch(new URL('private-documents/selection', api.base), {
    method: 'POST',
    headers: { ...api.headers, origin: 'https://untrusted.invalid' },
    body: JSON.stringify({ document_ref: imported.ref, pages: [2] }),
  });
  expect(wrongOrigin.status).toBe(403);
  const wrongEpoch = await fetch(new URL('private-documents/selection', api.base), {
    method: 'POST',
    headers: {
      ...api.headers,
      'x-signals-owner-epoch': '00000000-0000-4000-8000-000000000000',
    },
    body: JSON.stringify({ document_ref: imported.ref, pages: [2] }),
  });
  expect(wrongEpoch.status).toBe(409);
  const unknownField = await fetch(new URL('private-documents/selection', api.base), {
    method: 'POST',
    headers: api.headers,
    body: JSON.stringify({ document_ref: imported.ref, pages: [2], path: '/etc/passwd' }),
  });
  expect(unknownField.status).toBe(400);
  const selection = await fetch(new URL('private-documents/selection', api.base), {
    method: 'POST',
    headers: api.headers,
    body: JSON.stringify({ document_ref: imported.ref, pages: [2] }),
  });
  expect(selection.status).toBe(200);
  expect(await selection.json()).toMatchObject({ pages: [2], sources: [{ text: 'Page two' }] });
});
