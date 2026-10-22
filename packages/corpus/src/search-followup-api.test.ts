import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { expect, it, vi } from 'vitest';
import { budgets, type SearchResult } from '../../domain/src/search-contract.js';
import { digest } from './search-fetch.js';
import { requestStore } from './search-request-store.js';
import { loadRun, retainRun } from './search-store.js';
import { searchApi } from './search-api.js';
import type * as RunnerModule from './search-runner.js';
import {
  extractiveDiscussionRunner,
  type DiscussionCall,
} from '../../../tests/fixtures/frozen-followup-runner.js';

// The native runner must never be reached: readiness is a stub and discovery fails loudly.
vi.mock('./search-runner.js', async (original) => ({
  ...(await original<typeof RunnerModule>()),
  codexRunner: () => ({
    evidenceClass: 'configured-live',
    readiness: async () => ({
      available: false,
      broadSearch: false,
      runner: 'codex',
      reason: 'test stub',
    }),
    discover: async () => {
      throw new Error('native_runner_forbidden');
    },
  }),
}));

type Api = ReturnType<typeof searchApi>;
type Ref = { owner: string; kind: string; id: string; revision: string; digest: string };
/** Only the reply fields these checks read; JSON leaves absent fields undefined. */
type Body = {
  code: string;
  token: string;
  id: string;
  cancelled: boolean;
  content: string;
  receipt: { state: string; reason: string; request_digest: string };
  result_ref: Ref;
  ref: Ref;
  capabilities: { operations: { name: string }[] };
  records: {
    ref: Ref;
    kind: string;
    summary: string;
    visibility: string;
    open_capability: string;
  }[];
};
/** Drive the real handler in-process; no socket is opened. */
function call(api: Api, method: string, route: string, body?: unknown, headers = {}) {
  const request = Object.assign(
    Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]),
    {
      method,
      url: '/signals-ai/__signals/api/' + route,
      headers: {
        host: '127.0.0.1:5178',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...headers,
      },
    },
  );
  return new Promise<{ status: number; body: Body }>((done) => {
    let status = 0;
    const response = {
      writableEnded: false,
      once() {},
      writeHead(code: number) {
        status = code;
        return response;
      },
      end(text?: string) {
        done({ status, body: (text ? JSON.parse(text) : null) as Body });
      },
    };
    void api(request as unknown as IncomingMessage, response as unknown as ServerResponse);
  });
}
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const tankAnswer =
  '## Rainwater tank options\n\nA 2,000-litre polyethylene tank suits a small roof ([Guide](https://example.org/tanks)). First-flush diverters reduce sediment but need monthly cleaning. Concrete tanks last longer but cost about twice as much. Local permit rules were not checked.';
const cisternNote =
  'Provisional cistern notes: overflow pipes must drain away from foundations ([Code](https://example.org/code)). Sizing was not finished.';
function run(runId: string, query: string, text: string, answer: boolean): SearchResult {
  return {
    schemaVersion: 2,
    runId,
    query,
    status: answer ? 'completed' : 'cancelled',
    brief: { format: 'markdown', text },
    ...(answer
      ? {
          answerReceipt: {
            observedAt: '2026-10-20T10:00:00.000Z',
            sha256: digest(text),
            state: 'unassessed' as const,
            confidence: 'unknown' as const,
            provenance: { receipt: runId, requestedModel: null, servedModel: null },
          },
        }
      : {}),
    items: [],
    sources: [],
    coverage: [],
    gaps: [answer ? 'Citations were not assessed.' : 'Research was cancelled.'],
    usage: {
      searches: 0,
      documents: 0,
      elapsedMs: 0,
      modelCalls: 1,
      providerUsage: null,
      cost: null,
    },
    counts: { leads: 0, distinct: 0, duplicates: 0, omitted: 0 },
    limits: budgets.quick,
  };
}

async function setup() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'signals-followup-')));
  const scope = await requestStore(root).initialize();
  const answerId = randomUUID();
  const noteId = randomUUID();
  await retainRun(
    run(answerId, 'Which rainwater tank suits a small roof?', tankAnswer, true),
    root,
  );
  await retainRun(
    run(noteId, 'How should a cistern overflow be routed?', cisternNote, false),
    root,
  );
  const calls: DiscussionCall[] = [];
  const api = searchApi(
    root,
    undefined,
    undefined,
    undefined,
    undefined,
    extractiveDiscussionRunner((entry) => calls.push(entry)),
  );
  const { token } = (await call(api, 'GET', 'session')).body as { token: string };
  const owner = {
    'x-signals-provider-version': '1.0',
    'x-signals-instance-id': scope.identity,
    'x-signals-owner-epoch': scope.epoch,
  };
  const exact = async (kind: string, id: string) =>
    (
      await call(
        api,
        'GET',
        'provider/records?ref=' +
          encodeURIComponent(
            JSON.stringify({ owner: 'signals-ai', kind, id, revision: null, digest: null }),
          ),
        undefined,
        owner,
      )
    ).body.ref;
  const envelope = (
    parent_ref: Awaited<ReturnType<typeof exact>>,
    question: string,
    key = randomUUID(),
  ) => ({
    schema_version: '1.0',
    request_id: 'followup:' + key,
    idempotency_key: key,
    parent_ref,
    question,
    scope: 'saved-context-only',
    retention: 'private',
    authority_ref: {
      owner: 'signals-ai',
      kind: 'authority',
      id: 'test-user',
      revision: '1',
      digest: null,
    },
  });
  const ask = (target: Api, body: unknown, headers = {}) =>
    call(target, 'POST', 'followups', body, {
      'x-signals-token': token,
      'x-signals-owner-epoch': scope.epoch,
      ...headers,
    });
  const settled = async (target: Api, key: string) => {
    for (let n = 0; n < 200; n++) {
      const found = await call(target, 'GET', 'followups/' + key, undefined, owner);
      // Lock-free ledger reads can land between the writer's head and snapshot publication.
      if (
        found.status === 503 &&
        ['provider_unavailable', 'request_store_unavailable'].includes(found.body.code)
      ) {
        transientReads++;
        await new Promise((done) => setTimeout(done, 10));
        continue;
      }
      if (found.status !== 200) throw new Error('followup_lookup_' + JSON.stringify(found));
      if (!['unknown', 'admitted', 'cancel_requested'].includes(found.body.receipt?.state))
        return found.body;
      await new Promise((done) => setTimeout(done, 10));
    }
    throw new Error('followup_did_not_settle');
  };
  let transientReads = 0;
  return {
    root,
    scope,
    api,
    token,
    owner,
    calls,
    answerId,
    noteId,
    exact,
    envelope,
    ask,
    settled,
    transient: () => transientReads,
  };
}

it('answers a question about one exact saved answer from its frozen text and retains a linked child', async () => {
  const t = await setup();
  try {
    const capabilities = (await call(t.api, 'GET', 'provider/capabilities')).body;
    const operations = capabilities.capabilities.operations.map((row) => row.name);
    expect(operations).toEqual(expect.arrayContaining(['ask_saved_research', 'lookup_followup']));
    expect(t.calls).toHaveLength(0);

    const parentPath = join(t.root, '.signals/runs', `${t.answerId}.json`);
    const before = await readFile(parentPath);
    const parentRef = await t.exact('answer', t.answerId);
    const body = t.envelope(
      parentRef,
      'Which part needs cleaning, and were the permit rules checked?',
    );
    const started = await t.ask(t.api, body);
    expect(started.status).toBe(202);
    expect(started.body.receipt.state).toBe('unknown');
    const done = await t.settled(t.api, body.idempotency_key);
    expect(done.receipt).toMatchObject({
      state: 'complete',
      reason: 'followup_complete_child_retained',
    });
    expect(done.result_ref).toMatchObject({ owner: 'signals-ai', kind: 'answer' });

    const read = await call(
      t.api,
      'GET',
      'provider/records?ref=' + encodeURIComponent(JSON.stringify(done.result_ref)),
      undefined,
      t.owner,
    );
    expect(read.status).toBe(200);
    const child = JSON.parse(read.body.content) as SearchResult;
    // Meaningful extraction from the actual frozen parent text, not a canned reply.
    expect(child.brief!.text).toContain(
      'First-flush diverters reduce sediment but need monthly cleaning.',
    );
    expect(child.brief!.text).toContain('Local permit rules were not checked.');
    expect(child.brief!.text).not.toContain('Concrete tanks');
    expect(child.answerReceipt).toMatchObject({ state: 'unassessed', confidence: 'unknown' });
    expect(child.followupOf).toMatchObject({
      scope: 'saved-context-only',
      parent: parentRef,
      parentStatus: 'completed',
      parentQuery: 'Which rainwater tank suits a small roof?',
      requestDigest: done.receipt.request_digest,
    });
    expect(child.followupOf!.frozen.priorSynthesis).toBe(tankAnswer);
    expect(child.gaps.join(' ')).toContain('unassessed prior synthesis');
    expect(child.gaps.join(' ')).toContain(
      'Discussion only: no search, source access or verification',
    );
    expect(child.usage).toMatchObject({ searches: 0, documents: 0 });
    expect(t.calls).toEqual([expect.objectContaining({ question: body.question, live: false })]);
    // Original research bytes are untouched.
    expect(await readFile(parentPath)).toEqual(before);
    expect(sha(await readFile(parentPath))).toBe(parentRef.digest);

    // Same key and meaning returns the original identity without a second discussion.
    const again = await t.ask(t.api, body);
    expect(again.status).toBe(202);
    expect(again.body.id).toBe(started.body.id);
    expect(again.body.result_ref).toEqual(done.result_ref);
    const changed = await t.ask(t.api, { ...body, question: 'Something else?' });
    expect(changed.body.code).toBe('request_conflict');
    expect(t.calls).toHaveLength(1);

    // The child is an ordinary saved answer for Library search and exact Plan selection.
    const library = await call(
      t.api,
      'GET',
      'provider/library?q=' + encodeURIComponent('permit rules cleaning') + '&kinds=answer',
      undefined,
      t.owner,
    );
    const row = library.body.records.find((item) => item.ref.id === done.result_ref.id);
    expect(row).toMatchObject({
      kind: 'answer',
      visibility: 'private',
      open_capability: 'owner_route',
    });
    expect(row?.summary).toContain('Follow-up about saved research');
    expect(row?.ref.digest).toBe(done.result_ref.digest);

    // A later missing parent never erases or regenerates the child's copied scope.
    await rm(parentPath);
    const reopened = await call(
      t.api,
      'GET',
      'provider/records?ref=' + encodeURIComponent(JSON.stringify(done.result_ref)),
      undefined,
      t.owner,
    );
    expect(reopened.status).toBe(200);
    expect(reopened.body.content).toBe(read.body.content);
    expect((await loadRun(done.result_ref.id, t.root)).followupOf!.frozen.priorSynthesis).toBe(
      tankAnswer,
    );
    expect((await t.settled(t.api, body.idempotency_key)).result_ref).toEqual(done.result_ref);
    const orphan = await t.ask(t.api, t.envelope(parentRef, 'Still there?'));
    expect(orphan).toMatchObject({ status: 404, body: { code: 'provider_record_not_found' } });
    expect(t.calls).toHaveLength(1);
  } finally {
    await rm(t.root, { recursive: true, force: true });
  }
});

it('refuses drifted, missing, malformed or unbound parents before admission or inference', async () => {
  const t = await setup();
  try {
    const parentRef = await t.exact('answer', t.answerId);
    const drift = t.envelope(
      { ...parentRef, digest: '0'.repeat(64), revision: 'sha256:' + '0'.repeat(64) },
      'Was anything checked?',
    );
    expect(await t.ask(t.api, drift)).toMatchObject({
      status: 409,
      body: { code: 'provider_record_changed' },
    });
    const missing = t.envelope({ ...parentRef, id: randomUUID() }, 'Was anything checked?');
    expect((await t.ask(t.api, missing)).body.code).toBe('provider_record_not_found');
    const wrongKind = t.envelope({ ...parentRef, kind: 'research_note' }, 'Was anything checked?');
    expect((await t.ask(t.api, wrongKind)).status).toBe(503);
    for (const bad of [
      { ...t.envelope(parentRef, 'q'), scope: 'web' },
      { ...t.envelope(parentRef, 'q'), retention: 'memory' },
      { ...t.envelope(parentRef, 'q'), parent_ref: { ...parentRef, revision: null } },
      { ...t.envelope(parentRef, 'q'), parent_ref: { ...parentRef, kind: 'entity' } },
      { ...t.envelope(parentRef, 'q'), path: '/etc/passwd' },
      t.envelope(parentRef, '\ud800'),
    ])
      expect((await t.ask(t.api, bad)).status).toBe(400);
    expect(
      (await t.ask(t.api, t.envelope(parentRef, 'q'), { 'x-signals-owner-epoch': randomUUID() }))
        .body.code,
    ).toBe('owner_epoch_mismatch');
    expect(
      (await t.ask(t.api, t.envelope(parentRef, 'q'), { 'x-signals-token': 'wrong' })).body.code,
    ).toBe('csrf_token_required');
    for (const refused of [drift, missing, wrongKind])
      expect(
        (await call(t.api, 'GET', 'followups/' + refused.idempotency_key, undefined, t.owner))
          .status,
      ).toBe(404);
    expect(t.calls).toHaveLength(0);
  } finally {
    await rm(t.root, { recursive: true, force: true });
  }
});

it('keeps a stopped note incomplete, and leaves an interrupted follow-up unknown without replay', async () => {
  const t = await setup();
  try {
    const noteRef = await t.exact('research_note', t.noteId);
    const noteBody = t.envelope(noteRef, 'Where must overflow pipes drain?');
    await t.ask(t.api, noteBody);
    const note = await t.settled(t.api, noteBody.idempotency_key);
    const child = await loadRun(note.result_ref.id, t.root);
    expect(child.brief!.text).toContain('overflow pipes must drain away from foundations');
    expect(child.followupOf).toMatchObject({ parentStatus: 'cancelled', parent: noteRef });
    expect(child.gaps.join(' ')).toContain('stopped before completion');
    expect(child.gaps.join(' ')).toContain('does not complete the original research');
    expect((await loadRun(t.noteId, t.root)).status).toBe('cancelled');

    // A discussion that never answers: restart the owner while dispatch may have started.
    let release: () => void = () => {};
    const hanging = searchApi(t.root, undefined, undefined, undefined, undefined, () => ({
      discover: (_request, signal) =>
        new Promise<never>((_, reject) => {
          release = () => reject(new Error('cancelled'));
          signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
        }),
    }));
    const hangingToken = (await call(hanging, 'GET', 'session')).body.token;
    const answerRef = await t.exact('answer', t.answerId);
    const body = t.envelope(answerRef, 'Which tank lasts longer?');
    const started = await t.ask(hanging, body, { 'x-signals-token': hangingToken });
    expect(started.body.receipt.state).toBe('unknown');
    let coldCalls = 0;
    const cold = searchApi(t.root, undefined, undefined, undefined, undefined, () => ({
      discover: async () => {
        coldCalls++;
        throw new Error('cold_owner_must_not_discuss');
      },
    }));
    const coldToken = (await call(cold, 'GET', 'session')).body.token;
    const lookup = await call(cold, 'GET', 'followups/' + body.idempotency_key, undefined, t.owner);
    expect(lookup.body.receipt).toMatchObject({
      state: 'unknown',
      reason: 'dispatch_may_have_started',
    });
    expect(lookup.body.result_ref).toBeNull();
    const repeated = await t.ask(cold, body, { 'x-signals-token': coldToken });
    expect(repeated.status).toBe(202);
    expect(repeated.body.receipt.state).toBe('unknown');
    expect(coldCalls).toBe(0);

    // The live owner's existing cancel route settles the same identity.
    const cancel = await call(
      hanging,
      'POST',
      'cancel/' + started.body.id,
      {},
      {
        'x-signals-token': hangingToken,
      },
    );
    expect(cancel.body).toEqual({ cancelled: true });
    release();
    const final = await t.settled(cold, body.idempotency_key);
    expect(final.receipt.state).toBe('cancelled');
    expect(final.receipt.reason).toContain('followup_cancelled');
    expect(final.result_ref).toBeNull();
    expect(coldCalls).toBe(0);
  } finally {
    await rm(t.root, { recursive: true, force: true });
  }
});
