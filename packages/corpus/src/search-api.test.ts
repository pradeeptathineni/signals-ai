import { createServer, request as httpRequest } from 'node:http';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it, expect } from 'vitest';
import { searchApi } from './search-api.js';
import { resolvePublicUrl, publicTransportUrl } from './search-fetch.js';
import { signalSearch } from './signal-search.js';

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
