import type { Pool } from 'pg';
import { newOpaqueId } from '../../domain/src/ids.js';
import {
  assessAdoptionReadinessV2,
  type AdoptionReadinessV2Input,
} from '../../scoring/src/adoption-readiness.js';
import { claimFreshness, type ClaimReview } from '../../domain/src/public-corpus.js';
import { exportEvidence, validateEvidence } from './evidence-repository.js';
import { DomainValidationError } from './errors.js';

export async function recordAdoptionReadiness(
  pool: Pool,
  workspaceId: string,
  id: string,
  input: Omit<AdoptionReadinessV2Input, 'completedTrial'> & {
    candidateId: string;
    consumerTask: string;
    actor: 'human' | 'agent-reviewed';
    feedbackId?: string;
    claimReviews?: ClaimReview[];
  },
) {
  const stored = await exportEvidence(pool, id);
  if (!input.consumerTask?.trim() || input.consumerTask.length > 240)
    throw new DomainValidationError('Readiness must name a bounded consumer task.');
  const bundle = validateEvidence(stored.bytes, stored.digest);
  const candidate = bundle.candidates.find((c) => c.id === input.candidateId);
  if (
    !candidate ||
    !input.supportedClaimIds.every(
      (claimId) =>
        candidate.claim_ids.includes(claimId) &&
        bundle.claims.some((c) => c.id === claimId && ['observed', 'supported'].includes(c.status)),
    )
  )
    throw new DomainValidationError(
      'Readiness support must bind supported claims of the exact candidate.',
    );
  const reviews = input.claimReviews ?? [];
  if (
    new Set(reviews.map((review) => review.claimId)).size !== reviews.length ||
    reviews.some(
      (review) =>
        !input.supportedClaimIds.includes(review.claimId) ||
        !['stable', 'volatile', 'unknown'].includes(review.basis) ||
        (review.basis === 'volatile'
          ? !Number.isInteger(review.reviewAfterDays) ||
            review.reviewAfterDays! < 1 ||
            review.reviewAfterDays! > 3650
          : review.reviewAfterDays !== null),
    )
  )
    throw new DomainValidationError(
      'Freshness reviews must uniquely bind selected claims and valid review windows.',
    );
  const feedback = input.feedbackId
    ? await pool.query<{ outcome: string; action_scope: string | null }>(
        'SELECT outcome,action_scope FROM ops.evidence_feedback WHERE id=$1 AND workspace_id=$2 AND bundle_id=$3 AND candidate_id=$4 AND consumer_task=$5',
        [input.feedbackId, workspaceId, id, input.candidateId, input.consumerTask],
      )
    : null;
  if (input.feedbackId && !feedback?.rowCount)
    throw new DomainValidationError(
      'Trial feedback must bind this exact bundle/candidate and consumer task.',
    );
  if (feedback?.rows[0]?.action_scope && feedback.rows[0].action_scope !== input.purpose)
    throw new DomainValidationError('Trial feedback action does not match this assessment.');
  const asOf = new Date().toISOString();
  const freshness = bundle.claims
    .filter((claim) => input.supportedClaimIds.includes(claim.id))
    .map((claim) => ({
      claimId: claim.id,
      state: claimFreshness(
        claim,
        bundle.sources,
        reviews.find((review) => review.claimId === claim.id) ?? {
          claimId: claim.id,
          basis: 'unknown',
          reviewAfterDays: null,
        },
        asOf,
      ),
    }));
  const freshnessUnknowns = freshness
    .filter((claim) => claim.state !== 'current')
    .map((claim) => `Claim ${claim.claimId}: freshness ${claim.state}.`);
  const contradictory = candidate.claim_ids.some((claimId) =>
    bundle.claims.some((claim) => claim.id === claimId && claim.status === 'contradicted'),
  );
  if (contradictory) freshnessUnknowns.push('Conflicting claims require scoped review.');
  const result = {
    ...assessAdoptionReadinessV2({
      ...input,
      boundedCheck: ['failed', 'regressed'].includes(feedback?.rows[0]?.outcome ?? '')
        ? 'failed'
        : input.boundedCheck,
      criticalClaimSupported: input.criticalClaimSupported && !contradictory,
      unknowns: [...input.unknowns, ...freshnessUnknowns],
      completedTrial:
        feedback?.rows[0]?.outcome === 'useful' && feedback.rows[0].action_scope === input.purpose,
    }),
    freshness,
    assessedAt: asOf,
  };
  const assessmentId = newOpaqueId();
  await pool.query(
    `INSERT INTO ops.adoption_readiness (id,workspace_id,bundle_id,candidate_id,actor_type,policy_version,input,result)
    VALUES ($1,$2,$3,$4,$5,'adoption-readiness-v2',$6,$7)`,
    [
      assessmentId,
      workspaceId,
      id,
      input.candidateId,
      input.actor,
      JSON.stringify(input),
      JSON.stringify(result),
    ],
  );
  return {
    id: assessmentId,
    ...result,
    observationBasis: `${input.actor} declared checks; linked feedback is local observed evidence`,
    authority: 'recommendation-only',
  };
}
