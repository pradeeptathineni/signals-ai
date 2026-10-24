import { createServer } from 'node:http';
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it, vi } from 'vitest';
import { searchApi } from './search-api.js';
import { defaultSettings, saveSettings } from './search-settings.js';

const canary = 'PRIVATE_QUERY_THINKING_DIAGNOSTIC_CANARY';
const fake = `#!${process.execPath}
const fs = require('node:fs'), path = require('node:path');
const home = process.env.HOME, args = process.argv.slice(2);
if (args[0] === '--version') console.log('codex-cli 0.160.0');
else if (args[0] === 'login') console.log('Logged in using ChatGPT');
else if (args[1] === '--help') console.log('Usage: codex exec [OPTIONS] [PROMPT]\\n --ignore-user-config --ignore-rules --ephemeral --skip-git-repo-check --sandbox --json --output-schema --cd --model --config');
else {
  fs.appendFileSync(path.join(home, 'invocations'), 'native\\n');
  const mode = fs.readFileSync(path.join(home, 'mode'), 'utf8');
  process.stdin.resume();
  process.stdin.on('end', () => {
    const emit = value => console.log(JSON.stringify(value));
    emit({type:'thread.started',thread_id:'synthetic'});
    emit({type:'turn.started'});
    emit({type:'item.completed',item:{type:'reasoning',text:'${canary}'}});
    emit({type:'item.started',item:{type:'web_search',id:'web-1'}});
    emit({type:'item.completed',item:{type:'web_search',id:'web-1',action:{type:'search',query:'${canary}'}}});
    emit({type:'item.completed',item:{type:'web_search',id:'web-2',action:{type:'open_page',url:'https://example.org/guide?${canary}'}}});
    emit({type:'item.completed',item:{type:'agent_message',text:'Partial fixture answer.'}});
    process.stderr.write('${canary}');
    if (mode === 'hang') return setInterval(() => {}, 1000);
    setTimeout(() => {
      emit({type:'item.completed',item:{type:'agent_message',text:'Final fixture answer.'}});
      emit({type:'turn.completed',usage:{input_tokens:1,output_tokens:1}});
    }, 1000);
  });
}
`;

it('forwards actual native activity through admitted owner requests without replay or private output', async () => {
  const fixture = await realpath(await mkdtemp(join(tmpdir(), 'signals-research-activity-')));
  const root = join(fixture, 'owner'),
    home = join(fixture, 'home'),
    bin = join(fixture, 'bin'),
    temp = join(fixture, 'tmp');
  await Promise.all([root, home, bin, temp].map((directory) => mkdir(directory)));
  await writeFile(join(bin, 'codex'), fake);
  await chmod(join(bin, 'codex'), 0o755);
  await writeFile(join(home, 'mode'), 'complete');
  vi.stubEnv('PATH', bin);
  vi.stubEnv('HOME', home);
  vi.stubEnv('TMPDIR', temp);
  vi.stubEnv('CODEX_HOME', home);
  await saveSettings(
    { ...defaultSettings, profile: 'quick', supplementalSites: [], followedSources: [] },
    root,
  );
  await writeFile(
    join(root, '.signals/providers.json'),
    JSON.stringify({ publicApis: false, jina: false }),
  );
  let handler = searchApi(root);
  const original = handler;
  const server = createServer((request, response) => {
    void handler(request, response);
  });
  await new Promise<void>((done, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', done);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no_port');
  const base = `http://127.0.0.1:${address.port}/signals-ai/__signals/api/`;
  const journey: unknown[] = [];
  const invokeCount = async () =>
    (await readFile(join(home, 'invocations'), 'utf8').catch(() => ''))
      .trim()
      .split('\n')
      .filter(Boolean).length;
  const wait = async (read: () => Promise<any>, ready: (value: any) => boolean) => {
    for (let index = 0; index < 200; index++) {
      const value = await read();
      if (!value.code && ready(value)) return value;
      await new Promise((done) => setTimeout(done, 20));
    }
    throw new Error('fixture_activity_timeout');
  };
  try {
    const { token } = await (await fetch(base + 'session')).json();
    const writeHeaders = { 'content-type': 'application/json', 'x-signals-token': token };
    const scope = await (
      await fetch(base + 'request-scope', { method: 'POST', headers: writeHeaders, body: '{}' })
    ).json();
    const headers = {
      ...writeHeaders,
      'x-signals-provider-version': '1.0',
      'x-signals-instance-id': scope.identity,
      'x-signals-owner-epoch': scope.epoch,
    };
    const body = (number: number) => ({
      schema_version: '1.0',
      request_id: 'question-' + number,
      idempotency_key: 'key-' + number,
      query: 'Fixture question ' + canary,
      method: 'answer-first',
      profile: 'quick',
      cache: 'memory',
      save: 'never',
      project_ref: null,
      authority_ref: {
        owner: 'signals-ai',
        kind: 'authority',
        id: 'fixture',
        revision: '1',
        digest: null,
      },
    });
    const post = async (number: number, selectedHeaders = headers) =>
      fetch(base + 'search', {
        method: 'POST',
        headers: selectedHeaders,
        body: JSON.stringify(body(number)),
      });
    const read = async (id: string, cursor = '') => {
      const response = await fetch(base + 'provider/research-activity?request_id=' + id + cursor, {
        headers,
      });
      if (response.status === 503) {
        const unavailable = await response.json();
        expect(['provider_unavailable', 'request_store_unavailable']).toContain(unavailable.code);
        return unavailable; // The existing two-file ledger may be unavailable during publication
      }
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      return response.json();
    };
    const capabilities = await (await fetch(base + 'provider/capabilities', { headers })).json();
    expect(capabilities.capabilities.contracts).toContainEqual({
      id: 'research-activity',
      versions: ['1.0'],
    });
    const acceptedResponse = await post(1);
    expect(acceptedResponse.status).toBe(202);
    const accepted = await acceptedResponse.json();
    const live = await wait(
      () => read(accepted.id),
      (batch) => batch.events.some((row: any) => row.kind === 'checkpoint'),
    );
    expect(live.owner_settled).toBe(false);
    expect(live.session_settled).toBe(false);
    expect(live.session_id).toMatch(/^[a-f0-9-]{36}$/);
    const checkpoint = await (await fetch(base + 'runs/' + accepted.id)).json();
    expect(checkpoint.brief.text).toBe('Partial fixture answer.');
    const duplicate = await (await post(1)).json();
    expect(duplicate.id).toBe(accepted.id);
    expect(await invokeCount()).toBe(1);
    const endpoint = base + 'provider/research-activity?request_id=' + accepted.id;
    expect((await fetch(endpoint)).status).toBe(428);
    expect(
      (await fetch(endpoint, { headers: { ...headers, 'x-signals-owner-epoch': 'wrong' } })).status,
    ).toBe(409);
    expect(
      (await fetch(endpoint, { headers: { ...headers, origin: 'https://example.invalid' } }))
        .status,
    ).toBe(403);
    expect(
      (
        await fetch(endpoint + '&after=1&session_id=wrong&store_epoch=' + live.store_epoch, {
          headers,
        })
      ).status,
    ).toBe(409);
    const cursor = `&after=${live.next_cursor}&session_id=${live.session_id}&store_epoch=${live.store_epoch}`;
    const replay = await read(accepted.id, cursor);
    expect(replay.events.every((row: any) => row.sequence > live.next_cursor)).toBe(true);
    const final = await wait(
      () => read(accepted.id),
      (batch) => batch.complete,
    );
    const result = await (await fetch(base + 'runs/' + accepted.id)).json();
    expect(result.result.brief.text).toBe('Final fixture answer.');
    expect(final.events.at(-1)).toMatchObject({
      kind: 'session.settled',
      detail: { completed: true, cleanup: true },
    });
    expect(
      final.events.find(
        (row: any) => row.kind === 'web.completed' && row.detail.urlStatus === 'withheld',
      ).detail.url,
    ).toBeNull();
    expect(JSON.stringify(final)).not.toContain(canary);
    expect(JSON.stringify(final)).not.toContain('Partial fixture answer');
    journey.push(
      {
        stage: 'live_before_result',
        request: accepted.id,
        session: live.session_id,
        cursor: live.next_cursor,
        owner_settled: live.owner_settled,
        invocations: 1,
      },
      {
        stage: 'completed',
        session_settled: final.session_settled,
        complete: final.complete,
        checkpoint_retained: true,
        answer: result.result.brief.text,
      },
    );

    await writeFile(join(home, 'mode'), 'hang');
    const second = await (await post(2)).json();
    const concurrent = await wait(
      () => read(second.id),
      (batch) => batch.session_id !== null,
    );
    expect(concurrent.session_id).not.toBe(final.session_id);
    expect((await read(accepted.id)).session_id).toBe(final.session_id);
    const cancel = await fetch(base + 'cancel/' + second.id, {
      method: 'POST',
      headers,
      body: '{}',
    });
    expect(cancel.status).toBe(200);
    const cancelled = await wait(
      () => read(second.id),
      (batch) => batch.owner_settled && batch.session_settled,
    );
    expect(cancelled.events.at(-1)).toMatchObject({
      kind: 'session.settled',
      detail: { completed: false, cleanup: true },
    });
    expect(cancelled.events.some((row: any) => row.kind === 'session.stopped')).toBe(true);
    const cancelledReceipt = await (await fetch(base + 'requests/key-2', { headers })).json();
    expect(cancelledReceipt.receipt.state).toBe('cancelled');
    journey.push({
      stage: 'cancelled',
      request: second.id,
      session: concurrent.session_id,
      settlement: cancelled.events.at(-1).detail,
    });

    await writeFile(join(home, 'mode'), 'complete');
    const third = await (await post(3)).json();
    const beforeRestart = await wait(
      () => read(third.id),
      (batch) => batch.session_id !== null,
    );
    handler = searchApi(root);
    const lost = await read(third.id);
    expect(lost).toMatchObject({
      availability: 'unavailable',
      observation_lost: true,
      gap: true,
      complete: false,
      events: [],
    });
    expect(lost.store_epoch).not.toBe(beforeRestart.store_epoch);
    expect(
      (
        await fetch(
          base +
            `provider/research-activity?request_id=${third.id}&store_epoch=${beforeRestart.store_epoch}`,
          { headers },
        )
      ).status,
    ).toBe(409);
    const recovery = await (await fetch(base + 'requests/key-3', { headers })).json();
    expect(recovery.receipt.state).toBe('unknown');
    const renewed = await (await fetch(base + 'session')).json();
    expect(
      (await (await post(3, { ...headers, 'x-signals-token': renewed.token })).json()).id,
    ).toBe(third.id);
    expect(await invokeCount()).toBe(3);
    journey.push({
      stage: 'owner_restarted',
      availability: lost.availability,
      gap: lost.gap,
      durable_state: recovery.receipt.state,
      native_invocations: await invokeCount(),
    });
    handler = original;
    await wait(
      () => read(third.id),
      (batch) => batch.owner_settled,
    );
    if (process.env.SIGNALS_ACTIVITY_RECEIPT)
      await writeFile(
        process.env.SIGNALS_ACTIVITY_RECEIPT,
        JSON.stringify(journey, null, 2) + '\n',
      );
    console.log('ACTIVITY_OWNER_JOURNEY ' + JSON.stringify(journey));
  } finally {
    await new Promise<void>((done) => server.close(() => done()));
    vi.unstubAllEnvs();
    await rm(fixture, { recursive: true, force: true });
  }
}, 20000);
