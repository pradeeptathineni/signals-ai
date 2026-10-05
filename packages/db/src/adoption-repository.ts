import type { Pool } from 'pg';
import { newOpaqueId } from '../../domain/src/ids.js';
import {
  assessAdoptionReadiness,
  type AdoptionReadinessInput,
} from '../../scoring/src/adoption-readiness.js';
import { exportEvidence, validateEvidence } from './evidence-repository.js';
import { DomainValidationError } from './errors.js';

export async function recordAdoptionReadiness(
  pool: Pool,
  workspaceId: string,
  id: string,
  input: Omit<AdoptionReadinessInput, 'completedTrial'> & {
    candidateId: string;
    actor: 'human' | 'agent-reviewed';
    feedbackId?: string;
  },
) {
  const stored = await exportEvidence(pool, id);
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
  const feedback = input.feedbackId
    ? await pool.query<{ outcome: string }>(
        'SELECT outcome FROM ops.evidence_feedback WHERE id=$1 AND workspace_id=$2 AND bundle_id=$3 AND candidate_id=$4',
        [input.feedbackId, workspaceId, id, input.candidateId],
      )
    : null;
  if (input.feedbackId && !feedback?.rowCount)
    throw new DomainValidationError('Trial feedback must bind this exact bundle/candidate.');
  const boundSources = bundle.sources.filter((source) =>
    bundle.claims.some(
      (claim) => input.supportedClaimIds.includes(claim.id) && claim.source_ids.includes(source.id),
    ),
  );
  const freshnessUnknowns = boundSources.some((source) => !source.observed_at)
    ? ['Source observation date unknown.']
    : [];
  if (
    boundSources.some(
      (source) => source.observed_at && Date.now() - Date.parse(source.observed_at) > 90 * 86400000,
    )
  )
    freshnessUnknowns.push('Source evidence is older than the v1 90-day review window.');
  const contradictory = candidate.claim_ids.some((claimId) =>
    bundle.claims.some((claim) => claim.id === claimId && claim.status === 'contradicted'),
  );
  if (contradictory) freshnessUnknowns.push('Conflicting claims require scoped review.');
  const result = assessAdoptionReadiness({
    ...input,
    criticalClaimSupported: input.criticalClaimSupported && !contradictory,
    unknowns: [...input.unknowns, ...freshnessUnknowns],
    completedTrial: feedback?.rows[0]?.outcome === 'useful',
  });
  const assessmentId = newOpaqueId();
  await pool.query(
    `INSERT INTO ops.adoption_readiness (id,workspace_id,bundle_id,candidate_id,actor_type,policy_version,input,result)
    VALUES ($1,$2,$3,$4,$5,'adoption-readiness-v1',$6,$7)`,
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
