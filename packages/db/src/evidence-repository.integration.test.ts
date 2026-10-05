import { beforeAll, afterAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
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
import { recordAdoptionReadiness } from './adoption-repository.js';
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
  expect(
    await reviewEvidenceDraft(pool, localWorkspaceId, draft.id, {
      actor: 'agent-reviewed',
      rationale: 'Bounded regression review.',
      blockers: [],
    }),
  ).toMatchObject({ id: admitted.id, replay: true });
  await expect(
    reviewEvidenceDraft(pool, localWorkspaceId, draft.id, {
      actor: 'agent-reviewed',
      rationale: 'Bounded regression review.',
      blockers: ['A newly reported critical blocker.'],
    }),
  ).rejects.toThrow('immutable review');
  await expect(
    reviewEvidenceDraft(pool, localWorkspaceId, draft.id, {
      actor: 'human',
      rationale: 'A different actor cannot relabel this review.',
      blockers: [],
    }),
  ).rejects.toThrow('immutable review');
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
  const revisionAudit = await pool.query(
    `SELECT max(a.object_revision) AS revision FROM ops.audit_events a
    JOIN catalog.knowledge_documents d ON d.id::text=a.object_id
    WHERE a.action='knowledge_document.furnish' AND d.canonical_uri=$1`,
    [bundle.candidates[0]!.canonical_uri],
  );
  expect(revisionAudit.rows[0].revision).toBe(revised.corpusLinks?.[0]?.revision);
  expect((await exportEvidence(pool, admitted.id)).bytes).toBe(bytes);
  bundle.bundle_id = 'competing-successor';
  const competingBytes = JSON.stringify(bundle);
  const competing = await importEvidenceDraft(
    pool,
    localWorkspaceId,
    competingBytes,
    evidenceDigest(competingBytes),
  );
  await expect(
    reviewEvidenceDraft(pool, localWorkspaceId, competing.id, {
      actor: 'agent-reviewed',
      rationale: 'Concurrent or competing correction.',
      blockers: [],
      predecessorId: admitted.id,
    }),
  ).rejects.toThrow('immutable successor');
});
it('rejects fixture promotion and a model-led label without a stored run', async () => {
  for (const mode of ['fixture', 'model-led'] as const) {
    const bytes = JSON.stringify(evidenceExample(mode));
    await expect(
      importEvidenceDraft(pool, localWorkspaceId, bytes, evidenceDigest(bytes)),
    ).rejects.toThrow();
  }
});
it('binds readiness and feedback to exact candidates and enforces bytes for alternate writers', async () => {
  const bundle = evidenceExample('agent-assisted');
  bundle.bundle_id = `binding-${randomUUID()}`;
  const bytes = JSON.stringify(bundle);
  const draft = await importEvidenceDraft(pool, localWorkspaceId, bytes, evidenceDigest(bytes));
  const admitted = await reviewEvidenceDraft(pool, localWorkspaceId, draft.id, {
    actor: 'agent-reviewed',
    rationale: 'Synthetic integrity regression.',
    blockers: [],
  });
  const input = {
    candidateId: 'candidate',
    actor: 'agent-reviewed' as const,
    purpose: 'use' as const,
    supportedClaimIds: ['c1'],
    documentedInterface: true,
    boundedCheck: 'passed' as const,
    compatibility: 'compatible' as const,
    redistribution: 'unknown' as const,
    authoritySafe: true,
    criticalClaimSupported: true,
    unknowns: [],
  };
  expect(await recordAdoptionReadiness(pool, localWorkspaceId, admitted.id, input)).toMatchObject({
    disposition: 'trial',
    authority: 'recommendation-only',
  });
  await expect(
    recordAdoptionReadiness(pool, localWorkspaceId, admitted.id, {
      ...input,
      supportedClaimIds: ['missing'],
    }),
  ).rejects.toThrow('exact candidate');
  await expect(
    recordAdoptionReadiness(pool, localWorkspaceId, admitted.id, {
      ...input,
      feedbackId: randomUUID(),
    }),
  ).rejects.toThrow('exact bundle');
  const feedback = await recordEvidenceFeedback(pool, localWorkspaceId, admitted.id, {
    candidateId: 'candidate',
    consumerTask: 'regression-only',
    outcome: 'useful',
    detail: 'Synthetic trial outcome for contract testing.',
    idempotencyKey: randomUUID(),
  });
  expect(
    await recordAdoptionReadiness(pool, localWorkspaceId, admitted.id, {
      ...input,
      feedbackId: feedback.id,
    }),
  ).toMatchObject({ disposition: 'adopt' });
  for (const outcome of ['failed', 'regressed'] as const) {
    const failure = await recordEvidenceFeedback(pool, localWorkspaceId, admitted.id, {
      candidateId: 'candidate',
      consumerTask: 'failed-trial-regression',
      outcome,
      detail: 'A recorded trial failure overrides a declared successful check.',
      idempotencyKey: randomUUID(),
    });
    expect(
      await recordAdoptionReadiness(pool, localWorkspaceId, admitted.id, {
        ...input,
        feedbackId: failure.id,
      }),
    ).toMatchObject({ disposition: 'reject', blockers: ['Required bounded check failed.'] });
  }
  await expect(
    pool.query(
      'INSERT INTO ops.evidence_drafts (id,workspace_id,bundle_id,bytes,digest,mode) VALUES ($1,$2,$3,$4,$5,$6)',
      [randomUUID(), localWorkspaceId, 'tampered', bytes, 'b'.repeat(64), 'agent-assisted'],
    ),
  ).rejects.toThrow();
  await expect(
    pool.query(
      'INSERT INTO ops.evidence_feedback (id,workspace_id,bundle_id,candidate_id,consumer_task,outcome,detail,idempotency_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [
        randomUUID(),
        localWorkspaceId,
        admitted.id,
        'wrong',
        'direct-writer',
        'useful',
        'Invalid binding',
        randomUUID(),
      ],
    ),
  ).rejects.toThrow('exact evidence bundle');
  await expect(
    pool.query(
      'INSERT INTO ops.adoption_readiness (id,workspace_id,bundle_id,candidate_id,actor_type,policy_version,input,result) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [
        randomUUID(),
        localWorkspaceId,
        admitted.id,
        'wrong',
        'agent-reviewed',
        'adoption-readiness-v1',
        {},
        {},
      ],
    ),
  ).rejects.toThrow('exact evidence bundle');
  await expect(
    pool.query('DELETE FROM ops.adoption_readiness WHERE bundle_id=$1', [admitted.id]),
  ).rejects.toThrow();
});
