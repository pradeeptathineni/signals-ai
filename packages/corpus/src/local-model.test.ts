import { createServer, type Server, type ServerResponse } from 'node:http';
import { afterEach, expect, it } from 'vitest';
import { localStructuredModel } from './local-model.js';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.closeAllConnections();
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
});
async function endpoint(reply: (response: ServerResponse) => void) {
  const server = createServer((_request, response) => reply(response));
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No fixture port');
  return `http://127.0.0.1:${address.port}/v1/chat/completions`;
}
it('refuses remote, credentialed and ambiguous model routes before calling them', () => {
  for (const url of [
    'https://127.0.0.1:5000/',
    'http://example.com:5000/',
    'http://localhost:5000/',
    'http://user:secret@127.0.0.1:5000/',
    'http://127.0.0.1:5000/?key=x',
  ])
    expect(() => localStructuredModel(url, 'fixture')).toThrow('explicit loopback');
});
it('bounds output, rejects redirects and duplicate keys, and validates only declared structured content', async () => {
  const scenarios = [
    {
      reply: (r: ServerResponse) => {
        r.writeHead(302, { location: 'https://example.com/' });
        r.end();
      },
      error: /fetch failed/,
    },
    {
      reply: (r: ServerResponse) => r.end('x'.repeat(262145)),
      error: /byte budget/,
    },
    {
      reply: (r: ServerResponse) =>
        r.end(JSON.stringify({ choices: [{ message: { content: '{"id":1,"id":2}' } }] })),
      error: /Duplicate/,
    },
    {
      reply: (r: ServerResponse) => {
        r.writeHead(503);
        r.end();
      },
      error: /unavailable/,
    },
  ];
  for (const scenario of scenarios) {
    const model = localStructuredModel(await endpoint(scenario.reply), 'fixture');
    await expect(model.propose('fixture', {}, {})).rejects.toThrow(scenario.error);
  }
  const model = localStructuredModel(
    await endpoint((r) =>
      r.end(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] })),
    ),
    'fixture',
  );
  expect(await model.propose('fixture', {}, {})).toEqual({ ok: true });
  await expect(model.propose('fixture', { text: 'x'.repeat(128000) }, {})).rejects.toThrow(
    'input exceeds',
  );
});
