import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createHash, randomUUID } from 'node:crypto';
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { retainRun } from './search-store.js';
import { budgets, type SearchResult } from '../../domain/src/search-contract.js';

const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const stop = async (child: ChildProcess) => {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const closed = once(child, 'close');
  child.kill('SIGKILL');
  await closed;
};
const serverFixture = fileURLToPath(
  new URL('../../../tests/fixtures/search-request-server.ts', import.meta.url),
);
const launch = async (root: string) => {
  await mkdir(join(root, 'bin'), { recursive: true });
  await writeFile(
    join(root, 'bin/codex'),
    `#!/bin/sh\necho "$*" >> '${root}/probes'\ncase "$*" in\n--version) echo 'codex offline fixture' ;;\n'login status') echo 'Logged in fixture' ;;\n*) exit 91 ;;\nesac\n`,
    { mode: 0o700 },
  );
  const child = spawn(process.execPath, ['--import', 'tsx', serverFixture, root, 'complete'], {
    env: {
      PATH:
        join(root, 'bin') +
        ':' +
        process.execPath.slice(0, process.execPath.lastIndexOf('/')) +
        ':/usr/bin:/bin',
      HOME: root,
      TMPDIR: root,
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let errors = '';
  child.stderr!.on('data', (bytes: Buffer) => {
    errors += bytes.toString();
  });
  const port = await new Promise<number>((done, reject) => {
    child.on('message', (message: { type: string; port: number }) => {
      if (message.type === 'ready') done(message.port);
    });
    child.once('exit', (code) => reject(new Error('fixture_exit_' + code + errors)));
    child.once('error', reject);
  });
  return { child, base: `http://127.0.0.1:${port}/signals-ai/__signals/api/` };
};

it('negotiates a portable owner boundary and reads exact partial answer bytes without readiness or generation', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'signals-provider-')));
  const consumer = await realpath(await mkdtemp(join(tmpdir(), 'signals-standalone-consumer-')));
  const children: ChildProcess[] = [];
  try {
    const first = await launch(root);
    children.push(first.child);
    const version = { 'x-signals-provider-version': '1.0' };
    expect((await fetch(first.base + 'provider/capabilities', { headers: version })).status).toBe(
      503,
    );
    await expect(lstat(join(root, '.signals'))).rejects.toMatchObject({ code: 'ENOENT' });
    const { token } = (await (await fetch(first.base + 'session')).json()) as { token: string };
    const auth = { 'content-type': 'application/json', 'x-signals-token': token };
    const scope = (await (
      await fetch(first.base + 'request-scope', { method: 'POST', headers: auth, body: '{}' })
    ).json()) as { identity: string; epoch: string };
    const capsResponse = await fetch(first.base + 'provider/capabilities', { headers: version });
    expect(capsResponse.status).toBe(200);
    const metadata = (await capsResponse.json()) as {
      capabilities: {
        instance_id: string;
        process_observation: boolean;
        contracts: { id: string; versions: string[] }[];
      };
    };
    expect(metadata.capabilities.instance_id).toBe(scope.identity);
    expect(metadata.capabilities.process_observation).toBe(true);
    expect(metadata.capabilities.contracts).toContainEqual({ id: 'K13', versions: ['1.0'] });
    expect(metadata.capabilities.contracts).toContainEqual({ id: 'K14', versions: ['1.0'] });
    const narrative = 'Original partial answer Ω\r\nQualification remains unknown.';
    const run: SearchResult = {
      schemaVersion: 2,
      runId: randomUUID(),
      query: 'offline retained fixture',
      status: 'partial',
      brief: { format: 'markdown', text: narrative },
      answerReceipt: {
        observedAt: '2026-10-21T05:00:00Z',
        sha256: hash(narrative),
        state: 'unassessed',
        confidence: 'unknown',
        provenance: {
          receipt: 'authored offline fixture',
          requestedModel: null,
          servedModel: null,
        },
      },
      items: [],
      sources: [],
      coverage: [],
      gaps: ['Still partial; not a quality claim.'],
      usage: {
        searches: 0,
        documents: 0,
        elapsedMs: 0,
        modelCalls: 0,
        providerUsage: null,
        cost: null,
      },
      counts: { leads: 0, distinct: 0, duplicates: 0, omitted: 0 },
      limits: budgets.quick,
    };
    await retainRun(run, root);
    const bytes = await readFile(join(root, '.signals/runs', run.runId + '.json'));
    const reference = {
      owner: 'signals-ai',
      kind: 'answer',
      id: run.runId,
      revision: null,
      digest: null,
    };
    const owned = {
      ...version,
      'x-signals-instance-id': scope.identity,
      'x-signals-owner-epoch': scope.epoch,
    };
    const open = (ref: unknown, extra: Record<string, string> = {}) =>
      fetch(first.base + 'provider/records?ref=' + encodeURIComponent(JSON.stringify(ref)), {
        headers: { ...owned, ...extra },
      });
    const probes = await readFile(join(root, 'probes'));
    const ledger = await readFile(join(root, '.signals/requests/ledger.json'));
    const opened = await open(reference);
    expect(opened.status).toBe(200);
    const exact = (await opened.json()) as { ref: typeof reference; content: string };
    expect(exact.content).toBe(bytes.toString());
    expect(exact.ref.digest).toBe(hash(bytes));
    expect(exact.ref.revision).toBe('sha256:' + hash(bytes));
    expect((await open({ ...reference, kind: 'research_run' })).status).toBe(200);
    expect((await open({ ...reference, kind: 'signal' })).status).toBe(400);
    expect((await open(reference, { 'x-signals-owner-epoch': randomUUID() })).status).toBe(409);
    expect(
      (
        await fetch(
          first.base + 'provider/records?ref=' + encodeURIComponent(JSON.stringify(reference)),
          { headers: version },
        )
      ).status,
    ).toBe(428);
    expect(
      (
        await fetch(
          first.base +
            'provider/records?ref=' +
            encodeURIComponent(JSON.stringify(reference)) +
            '&command=open',
          { headers: owned },
        )
      ).status,
    ).toBe(400);
    expect(JSON.parse(exact.content) as SearchResult).toMatchObject({
      status: 'partial',
      brief: { text: narrative },
    });
    expect((await open({ ...exact.ref, digest: 'f'.repeat(64) })).status).toBe(409);
    expect((await open(reference, { 'x-signals-instance-id': randomUUID() })).status).toBe(409);
    expect((await open({ ...reference, owner: 'another-owner' })).status).toBe(409);
    expect((await open(reference, { 'x-signals-provider-version': '2.0' })).status).toBe(426);
    expect((await open({ ...reference, id: '../../unowned', command: 'open path' })).status).toBe(
      400,
    );
    expect((await open({ ...reference, id: randomUUID() })).status).toBe(404);
    const escapedId = randomUUID();
    await symlink(join(root, 'probes'), join(root, '.signals/runs', escapedId + '.json'));
    expect((await open({ ...reference, id: escapedId })).status).toBe(503);
    const forbidden = await fetch(first.base + 'search', {
      method: 'POST',
      headers: { ...auth, origin: 'https://untrusted.example' },
      body: '{malformed',
    });
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toEqual({ code: 'untrusted_origin' });
    const request = {
      schema_version: '1.0',
      request_id: 'negotiation-test',
      idempotency_key: 'must-not-dispatch',
      query: 'Negotiation must precede action',
      method: 'answer-first',
      profile: 'quick',
      cache: 'memory',
      save: 'never',
      project_ref: null,
      authority_ref: {
        owner: 'signals-ai',
        kind: 'authority',
        id: 'local-fixture',
        revision: '1',
        digest: null,
      },
    };
    const incompatible = await fetch(first.base + 'search', {
      method: 'POST',
      headers: { ...auth, ...owned, 'x-signals-provider-version': '2.0' },
      body: JSON.stringify(request),
    });
    expect(incompatible.status).toBe(426);
    const wrongOwner = await fetch(first.base + 'search', {
      method: 'POST',
      headers: { ...auth, ...owned, 'x-signals-instance-id': randomUUID() },
      body: JSON.stringify(request),
    });
    expect(wrongOwner.status).toBe(409);
    await copyFile(
      fileURLToPath(new URL('../../../scripts/examples/provider-consumer.mjs', import.meta.url)),
      join(consumer, 'consumer.mjs'),
    );
    const consume = async (base: string) => {
      const child = spawn(
        process.execPath,
        ['consumer.mjs', base, scope.identity, scope.epoch, JSON.stringify(exact.ref)],
        {
          cwd: consumer,
          env: {
            PATH: process.execPath.slice(0, process.execPath.lastIndexOf('/')) + ':/usr/bin:/bin',
            HOME: consumer,
            TMPDIR: consumer,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      let stdout = '',
        stderr = '';
      child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });
      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
      const [exit] = await once(child, 'close');
      return { exit, stdout, stderr };
    };
    const standalone = await consume(first.base);
    expect(standalone.exit).toBe(0);
    expect((JSON.parse(standalone.stdout) as { content: string }).content).toBe(bytes.toString());
    await stop(first.child);
    const restarted = await launch(root);
    children.push(restarted.child);
    const reopened = await consume(restarted.base);
    expect(reopened.exit).toBe(0);
    expect(reopened.stdout).toBe(standalone.stdout);
    expect(await readFile(join(root, 'probes'))).toEqual(probes);
    expect(await readFile(join(root, '.signals/requests/ledger.json'))).toEqual(ledger);
    expect(await readFile(join(root, '.signals/runs', run.runId + '.json'))).toEqual(bytes);
    const callbackRows = (await readFile(join(root, 'callbacks.jsonl'), 'utf8').catch(() => ''))
      .split('\n')
      .filter(Boolean);
    expect(callbackRows).toHaveLength(0);
    await stop(restarted.child);
    const unavailable = await consume(restarted.base);
    expect(unavailable.exit).toBe(1);
    expect(unavailable.stderr).toContain('provider unavailable');
    if (process.env.S03_PROVIDER_EVIDENCE) {
      await writeFile(
        process.env.S03_PROVIDER_EVIDENCE,
        JSON.stringify(
          {
            scope,
            metadata,
            ref: exact.ref,
            content: exact.content,
            original_sha256: hash(bytes),
            standalone,
            restarted: reopened,
            unavailable,
            first_pid: first.child.pid,
            restarted_pid: restarted.child.pid,
            callback_rows: callbackRows,
            readiness_before: probes.toString(),
            readiness_after: (await readFile(join(root, 'probes'))).toString(),
            ledger_unchanged: (await readFile(join(root, '.signals/requests/ledger.json'))).equals(
              ledger,
            ),
          },
          null,
          2,
        ) + '\n',
      );
    }
  } finally {
    await Promise.all(children.map((child) => stop(child)));
    await rm(root, { recursive: true, force: true });
    await rm(consumer, { recursive: true, force: true });
  }
}, 30000);
