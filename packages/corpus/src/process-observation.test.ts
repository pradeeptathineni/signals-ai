import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { processObservation, type ObservedRun } from './process-observation.js';
import { requestStore, parseResearchRequest } from './search-request-store.js';

it('reports live evidence, requested cancellation and restarted durable unknown without inventing a child', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'signals-observe-')));
  try {
    const store = requestStore(root);
    const scope = await store.initialize();
    const admitted = await store.admit(
      parseResearchRequest({
        schema_version: '1.0',
        request_id: 'question-1',
        idempotency_key: 'same-effect',
        query: 'fixture question',
        method: 'answer-first',
        profile: 'quick',
        cache: 'none',
        save: 'never',
        project_ref: null,
        authority_ref: {
          owner: 'signals-ai',
          kind: 'authority',
          id: 'local',
          revision: '1',
          digest: null,
        },
      }),
      scope.epoch,
    );
    await store.dispatch(admitted.record.id, scope.epoch);
    const startedAt = new Date(Date.now() - 60_000).toISOString();
    const run: ObservedRun = {
      requestEpoch: scope.epoch,
      events: ['Starting research…', 'One source inspected'],
      startedAt,
      lastEvidenceAt: startedAt,
      settled: false,
    };
    const runs = new Map([[admitted.record.id, run]]);
    const observer = processObservation(root, runs);
    const first = await observer.snapshot();
    expect(first.full_snapshot).toBe(true);
    expect(first.complete_coverage).toBe(true);
    expect(first.cursor).toBeNull();
    expect(first.processes).toHaveLength(1);
    expect(first.processes[0]).toMatchObject({
      ref: { id: admitted.record.id },
      task_ref: { id: 'question-1' },
      lifecycle: 'running',
      model: null,
      heartbeat_at: startedAt,
      event_cursor: null,
      progress: { label: expect.stringContaining('One source inspected') },
    });
    expect(first.processes[0]!.actions).toEqual([
      expect.objectContaining({
        kind: 'cancel',
        enabled: true,
        target: expect.objectContaining({ id: admitted.record.id }),
      }),
      expect.objectContaining({
        kind: 'reconcile',
        target: expect.objectContaining({ id: 'same-effect' }),
      }),
    ]);
    const repeated = await observer.snapshot();
    expect(repeated.snapshot_revision).toBe(first.snapshot_revision);
    expect(repeated.processes[0]!.heartbeat_at).toBe(startedAt);

    await store.cancel(admitted.record.id, scope.epoch);
    run.cancelRequestedAt = new Date().toISOString();
    observer.changed();
    const pending = await observer.snapshot();
    expect(pending.sequence).toBeGreaterThan(first.sequence);
    expect(pending.processes[0]!.lifecycle).toBe('running');
    expect(pending.processes[0]!.wait_reason).toContain('outcome pending');

    const restarted = await processObservation(root, new Map()).snapshot();
    expect(restarted.store_epoch).not.toBe(pending.store_epoch);
    expect(restarted.processes[0]).toMatchObject({ lifecycle: 'unknown', heartbeat_at: null });
    expect(restarted.processes[0]!.actions[0]).toMatchObject({ kind: 'cancel', enabled: false });
    expect(restarted.processes[0]!.progress.label).toContain('unavailable');
    await store.settle(admitted.record.id, scope.epoch, 'partial');
    const settled = await processObservation(root, new Map()).snapshot();
    expect(settled.processes[0]!.lifecycle).toBe('succeeded');
    expect(settled.processes[0]!.progress.label).toContain('unavailable');
    expect(settled.processes[0]!.artifacts).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('keeps direct jobs bounded to the current owner and never turns silence into completion', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'signals-observe-direct-')));
  try {
    await requestStore(root).initialize();
    const id = randomUUID().replaceAll('-', '');
    const observedAt = new Date(Date.now() - 90_000).toISOString();
    const run: ObservedRun = {
      events: ['Starting research…'],
      startedAt: observedAt,
      lastEvidenceAt: observedAt,
      settled: false,
    };
    const observer = processObservation(root, new Map([[id, run]]));
    const active = await observer.snapshot();
    expect(active.processes[0]).toMatchObject({
      lifecycle: 'running',
      heartbeat_at: observedAt,
      task_ref: null,
      scope: 'unknown',
      model: null,
    });
    expect((await observer.snapshot()).snapshot_revision).toBe(active.snapshot_revision);
    const restarted = await processObservation(root, new Map()).snapshot();
    expect(restarted.processes).toEqual([]);
    expect(restarted.owner_coverage[0]!.reason).toContain('direct jobs disappear on restart');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
