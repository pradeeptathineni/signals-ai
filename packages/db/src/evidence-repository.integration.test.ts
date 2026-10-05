import { beforeAll, afterAll, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createPool } from './client.js';
import { testDatabaseUrl } from '../../test-fixtures/src/database.js';
import { evidenceExample } from '../../test-fixtures/src/evidence.js';
import { evidenceDigest } from '../../domain/src/evidence-exchange.js';
import { localWorkspaceId } from '../../seed/src/import.js';
import {
  importEvidenceDraft,
  reviewEvidenceDraft,
  exportEvidence,
  recordEvidenceFeedback,
} from './evidence-repository.js';
let pool: Pool;
beforeAll(() => {
  pool = createPool(testDatabaseUrl());
});
afterAll(async () => {
  await pool.end();
});
it('admits exact evidence, labels agent review, retains Corpus provenance and protects immutable history', async () => {
  const bundle = evidenceExample('agent-assisted');
  const bytes = JSON.stringify(bundle) + '\n';
  const digest = evidenceDigest(bytes);
  const draft = await importEvidenceDraft(pool, localWorkspaceId, bytes, digest);
  expect((await importEvidenceDraft(pool, localWorkspaceId, bytes, digest)).id).toBe(draft.id);
  await expect(
    reviewEvidenceDraft(pool, localWorkspaceId, draft.id, {
      actor: 'agent-reviewed',
      rationale: 'Bounded regression review.',
      blockers: ['Critical interface missing.'],
    }),
  ).rejects.toThrow('blockers');
  const admitted = await reviewEvidenceDraft(pool, localWorkspaceId, draft.id, {
    actor: 'agent-reviewed',
    rationale: 'Bounded regression review.',
    blockers: [],
  });
  expect((await exportEvidence(pool, admitted.id)).bytes).toBe(bytes);
  const audit = await pool.query('SELECT actor_type FROM ops.evidence_reviews WHERE draft_id=$1', [
    draft.id,
  ]);
  expect(audit.rows[0].actor_type).toBe('agent-reviewed');
  const document =
    await pool.query(`SELECT so.retrieval_method,so.observed_at FROM catalog.knowledge_documents d
    JOIN catalog.source_observations so ON so.id=d.source_observation_id WHERE d.title='Resource' ORDER BY d.created_at DESC LIMIT 1`);
  expect(document.rows[0].retrieval_method).toBe('agent-assisted:agent-reviewed');
  expect(new Date(document.rows[0].observed_at).toISOString()).toBe('2026-10-01T12:00:00.000Z');
  await expect(
    pool.query('UPDATE catalog.evidence_bundles SET bytes=$1 WHERE id=$2', ['tamper', admitted.id]),
  ).rejects.toThrow();
  const feedback = {
    candidateId: 'candidate',
    consumerTask: 'test-consumer',
    outcome: 'failed' as const,
    detail: 'Bounded check failed.',
    idempotencyKey: 'feedback-test',
  };
  expect(await recordEvidenceFeedback(pool, localWorkspaceId, admitted.id, feedback)).toMatchObject(
    { evidenceClass: 'local-observed', reconsider: true },
  );
  expect((await recordEvidenceFeedback(pool, localWorkspaceId, admitted.id, feedback)).replay).toBe(
    true,
  );
  await expect(
    recordEvidenceFeedback(pool, localWorkspaceId, admitted.id, {
      ...feedback,
      detail: 'Changed input.',
    }),
  ).rejects.toThrow('idempotency');
  await expect(
    recordEvidenceFeedback(pool, localWorkspaceId, admitted.id, {
      ...feedback,
      candidateId: 'missing',
    }),
  ).rejects.toThrow('candidate');
  bundle.bundle_id = 'test-successor';
  bundle.created_at = '2026-10-05T13:00:00Z';
  bundle.claims[0]!.text = 'A changed documented scope.';
  const nextBytes = JSON.stringify(bundle);
  const successor = await importEvidenceDraft(
    pool,
    localWorkspaceId,
    nextBytes,
    evidenceDigest(nextBytes),
  );
  const revised = await reviewEvidenceDraft(pool, localWorkspaceId, successor.id, {
    actor: 'agent-reviewed',
    rationale: 'Scope changed.',
    blockers: [],
    predecessorId: admitted.id,
  });
  expect((await exportEvidence(pool, revised.id)).changes).toContain(
    'claims changed; reconsider affected decisions.',
  );
  expect((await exportEvidence(pool, admitted.id)).bytes).toBe(bytes);
});
it('rejects fixture promotion and a model-led label without a stored run', async () => {
  for (const mode of ['fixture', 'model-led'] as const) {
    const bytes = JSON.stringify(evidenceExample(mode));
    await expect(
      importEvidenceDraft(pool, localWorkspaceId, bytes, evidenceDigest(bytes)),
    ).rejects.toThrow();
  }
});
