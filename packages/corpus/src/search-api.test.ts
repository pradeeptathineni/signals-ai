import { createServer, request as httpRequest } from 'node:http';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it, expect } from 'vitest';
import { searchApi } from './search-api.js';
import { resolvePublicUrl, publicTransportUrl } from './search-fetch.js';
import { signalSearch } from './signal-search.js';
import { loadEntities, retainRun } from './search-store.js';
import { budgets, type SearchResult } from '../../domain/src/search-contract.js';
import { randomUUID } from 'node:crypto';

it('keeps replay follow-ups behind mutation and retained-identity guards without invoking discovery', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'signals-followup-api-')));
  const [record] = await loadEntities();
  if (!record) throw new Error('missing_public_entity');
  const result: SearchResult = {
    schemaVersion: 2,
    runId: randomUUID(),
    query: 'retained public evidence',
    status: 'completed',
    items: [
      {
        entity: record.entity,
        match: { level: 'direct', reason: 'API guard test', sources: [] },
        eligible: false,
        reasons: ['manual_only'],
      },
    ],
    sources: [],
    coverage: [],
    gaps: [],
    usage: {
      searches: 0,
      documents: 0,
      elapsedMs: 0,
      modelCalls: 0,
      providerUsage: null,
      cost: null,
    },
    counts: { leads: 1, distinct: 1, duplicates: 0, omitted: 0 },
    limits: budgets.quick,
  };
  await retainRun(result, root);
  let reads = 0;
  const api = searchApi(
    root,
    async () => {
      throw new Error('discovery_must_not_run');
    },
    undefined,
    async (frozen, question, ids) => {
      reads++;
      expect(frozen.runId).toBe(result.runId);
      expect(question).toBe('What is supported?');
      expect(ids).toEqual([record.entity.id]);
      return {
        mode: 'frozen-evidence-replay',
        answer: 'Test replay; no model call.',
        statements: [],
        gaps: [],
        usage: null,
      };
    },
  );
  const server = createServer((request, response) => {
    void api(request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no_port');
  const base = `http://127.0.0.1:${address.port}/signals-ai/__signals/api/`;
  try {
    const { token } = (await (await fetch(`${base}session`)).json()) as { token: string };
    const headers = { 'content-type': 'application/json', 'x-signals-token': token };
    const body = JSON.stringify({
      runId: result.runId,
      ids: [record.entity.id],
      question: 'What is supported?',
    });
    expect(
      (
        await fetch(`${base}followup`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
        })
      ).status,
    ).toBe(403);
    expect((await fetch(`${base}followup`, { method: 'POST', headers, body })).status).toBe(400);
    expect(reads).toBe(0);
    expect(
      (
        await fetch(`${base}history/open`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ runId: result.runId }),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await fetch(`${base}followup`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            runId: result.runId,
            ids: ['entity-000000000000000000000000'],
            question: 'What is supported?',
          }),
        })
      ).status,
    ).toBe(400);
    expect(reads).toBe(0);
    const reply = await fetch(`${base}followup`, { method: 'POST', headers, body });
    expect(reply.status).toBe(200);
    expect(await reply.json()).toMatchObject({ mode: 'frozen-evidence-replay' });
    expect(reads).toBe(1);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(root, { recursive: true, force: true });
  }
});

it('finishes a rejected search with a visible error and allows the next request', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'signals-api-failure-')));
  const api = searchApi(root, async () => {
    throw new Error('injected_runner_failure');
  });
  const server = createServer((request, response) => {
    void api(request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no_port');
  const base = `http://127.0.0.1:${address.port}/signals-ai/__signals/api/`;
  try {
    const { token } = (await (await fetch(`${base}session`)).json()) as { token: string };
    const headers = { 'content-type': 'application/json', 'x-signals-token': token };
    const start = () =>
      fetch(`${base}search`, { method: 'POST', headers, body: '{"query":"ordinary question"}' });
    const first = await start();
    expect(first.status).toBe(202);
    const { id } = (await first.json()) as { id: string };
    const state = (await (await fetch(`${base}runs/${id}`)).json()) as { error: string };
    expect(state.error).toBe('injected_runner_failure');
    expect((await start()).status).toBe(202);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(root, { recursive: true, force: true });
  }
});

it('rejects remote origins, missing mutation tokens, oversized and arbitrary execution requests', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'signals-api-')));
  let invoked = 0;
  const api = searchApi(root, async (...args) => {
    invoked++;
    return signalSearch(...args);
  });
  const server = createServer((request, response) => {
    void api(request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no_port');
  const base = `http://127.0.0.1:${address.port}/signals-ai/__signals/api/`;
  try {
    expect(
      (await fetch(`${base}session`, { headers: { Origin: 'https://untrusted.example' } })).status,
    ).toBe(403);
    const rejectedHost = await new Promise<number | undefined>((resolveStatus, reject) => {
      const request = httpRequest(
        `${base}session`,
        { headers: { Host: 'evil.example' } },
        (response) => {
          response.resume();
          resolveStatus(response.statusCode);
        },
      );
      request.on('error', reject);
      request.end();
    });
    expect(rejectedHost).toBe(403);
    expect(
      (
        await fetch(`${base}search`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{"query":"x"}',
        })
      ).status,
    ).toBe(403);
    const session = (await (await fetch(`${base}session`)).json()) as { token: string };
    const headers = { 'content-type': 'application/json', 'x-signals-token': session.token };
    expect(
      (
        await fetch(`${base}search`, {
          method: 'POST',
          headers,
          body: '{"query":"x","command":"touch owned"}',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await fetch(`${base}search`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ query: 'x'.repeat(130000) }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await fetch(`${base}settings`, {
          method: 'POST',
          headers,
          body: '{"model":"secret","path":"/tmp/arbitrary"}',
        })
      ).status,
    ).toBe(400);
    expect(invoked).toBe(0);
    const sites = Array.from({ length: 16 }, (_, i) => `https://scope${i}.example`);
    expect(
      (
        await fetch(`${base}search`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ query: 'ordinary question', supplementalSites: sites }),
        })
      ).status,
    ).toBe(400);
    expect(invoked).toBe(0);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(root, { recursive: true, force: true });
  }
});

it('locates unassessed sources without invoking AI and enforces mutation guards', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'signals-source-api-')));
  let aiCalls = 0,
    sourceCalls = 0;
  const api = searchApi(
    root,
    async () => {
      aiCalls++;
      throw new Error('AI must not run');
    },
    async (request) => {
      sourceCalls++;
      expect(
        request.supplementalSites?.some((site) => new URL(site).hostname === 'github.com'),
      ).toBe(true);
      return {
        schemaVersion: 1,
        query: request.query,
        kind: 'unassessed-source-hits',
        hits: [],
        gaps: [],
        searches: 3,
        modelCalls: 0,
      };
    },
  );
  const server = createServer((request, response) => {
    void api(request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no_port');
  const base = `http://127.0.0.1:${address.port}/signals-ai/__signals/api/`;
  try {
    const { token } = (await (await fetch(`${base}session`)).json()) as { token: string };
    const body = JSON.stringify({ query: 'portable observability' });
    expect(
      (
        await fetch(`${base}sources`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
        })
      ).status,
    ).toBe(403);
    const headers = { 'content-type': 'application/json', 'x-signals-token': token };
    expect(
      (
        await fetch(`${base}sources`, {
          method: 'POST',
          headers: { ...headers, origin: 'https://example.com' },
          body,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(`${base}sources`, {
          method: 'POST',
          headers,
          body: '{"query":"x","unexpected":true}',
        })
      ).status,
    ).toBe(400);
    const response = await fetch(`${base}sources`, { method: 'POST', headers, body });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      kind: 'unassessed-source-hits',
      modelCalls: 0,
      searches: 3,
    });
    expect(sourceCalls).toBe(1);
    expect(aiCalls).toBe(0);
    expect(await (await fetch(`${base}corpus`)).json()).toEqual([]);
    expect(await (await fetch(`${base}history`)).json()).toMatchObject({ runs: [] });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(root, { recursive: true, force: true });
  }
});

it('blocks local, private, mapped and metadata fetch destinations before connecting', async () => {
  expect(publicTransportUrl('https://example.org/docs/').pathname).toBe('/docs/');
  for (const uri of [
    'https://127.0.0.1/',
    'https://10.0.0.1/',
    'https://169.254.169.254/',
    'https://[::ffff:127.0.0.1]/',
    'https://localhost/',
    'https://user:pass@example.com/',
    'http://example.com/',
    'https://example.com:8443/',
  ])
    await expect(resolvePublicUrl(uri)).rejects.toThrow();
});
