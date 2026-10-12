import { expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Type } from 'typebox';
import type * as OsModule from 'node:os';
import type * as ChildProcessModule from 'node:child_process';
const state = vi.hoisted(() => ({ home: '', reply: '' }));
vi.mock('node:os', async (original) => ({
  ...(await original<typeof OsModule>()),
  homedir: () => state.home,
}));
vi.mock('node:child_process', async (original) => {
  const actual = await original<typeof ChildProcessModule>();
  return {
    ...actual,
    spawn: () => {
      const child = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        stdin: {
          end: () => {
            queueMicrotask(() => {
              child.stdout.emit(
                'data',
                Buffer.from(
                  JSON.stringify({
                    type: 'item.completed',
                    item: { type: 'agent_message', text: state.reply },
                  }) + '\n',
                ),
              );
              child.emit('close', 0, null); // Guard must reject even if a process exits zero before kill lands.
            });
          },
        },
        pid: undefined,
        kill: () => true,
      });
      return child;
    },
  };
});
import { codexRunner, RunnerFailure } from './search-runner.js';
import { digest } from './search-fetch.js';

it.each(['oversize', 'malformed'])(
  'retains a bounded diagnostic and rejects %s output even with exit zero (authored events, no CLI/model process)',
  async (kind) => {
    state.home = await realpath(await mkdtemp(join(tmpdir(), 'signals-claim-wire-')));
    state.reply =
      kind === 'oversize' ? JSON.stringify({ value: 'public' }) + ' '.repeat(66000) : '{';
    try {
      const runner = codexRunner('gpt-6.1-sol', 'high', {
        task: 'Fixture only.',
        schema: Type.Object({ value: Type.String() }),
        live: false,
        maxResponseBytes: 65536,
      });
      const failure = await runner
        .discover(
          { query: 'public fixture', profile: 'quick', cache: 'memory' },
          new AbortController().signal,
          () => {},
        )
        .catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(RunnerFailure);
      const usage = (failure as RunnerFailure).providerUsage as {
        rejectedOutput: {
          text: string;
          capturedDigest: string;
          capturedBytes: number;
          omittedBytes: number;
        };
        termination: { trigger: string | null };
      };
      expect(usage.rejectedOutput.capturedDigest).toBe(digest(state.reply));
      expect(usage.rejectedOutput.capturedBytes).toBe(Buffer.byteLength(state.reply));
      expect(Buffer.byteLength(usage.rejectedOutput.text)).toBeLessThanOrEqual(32768);
      if (kind === 'oversize') expect(usage.termination.trigger).toBe('response_byte_limit');
    } finally {
      await rm(state.home, { recursive: true, force: true });
    }
  },
);
