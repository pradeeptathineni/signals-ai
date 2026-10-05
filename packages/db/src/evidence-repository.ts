import type { Pool } from 'pg';
import { execFileSync } from 'node:child_process';
import {
  evidenceChange,
  parseEvidenceBundle,
  newOpaqueId,
  type EvidenceBundle,
} from '../../domain/src/index.js';
import { furnishKnowledgeDocumentWithClient } from './authoring-repository.js';
import { ConflictError, DomainValidationError, NotFoundError } from './errors.js';
import { inTransaction } from './transaction.js';
import { getResearchRun } from './research-repository.js';
import {
  evidenceDigest,
  type ResearchCandidate,
  type ResearchSynthesisProposal,
} from '../../domain/src/index.js';

export function validateEvidence(bytes: string, digest: string): EvidenceBundle {
  try {
    return parseEvidenceBundle(bytes, digest);
  } catch (error) {
    throw new DomainValidationError(error instanceof Error ? error.message : 'Invalid evidence.');
  }
}

export async function importEvidenceDraft(
  pool: Pool,
  workspaceId: string,
  bytes: string,
  digest: string,
) {
  const bundle = validateEvidence(bytes, digest);
  if (bundle.mode === 'model-led')
    throw new DomainValidationError(
      'Model-led evidence requires the stored-run projection, not an agent draft.',
    );
  return persistEvidenceDraft(pool, workspaceId, bytes, digest, bundle);
}

async function persistEvidenceDraft(
  pool: Pool,
  workspaceId: string,
  bytes: string,
  digest: string,
  bundle: EvidenceBundle,
) {
  const id = newOpaqueId();
  await pool.query(
    `INSERT INTO ops.evidence_drafts (id, workspace_id, bundle_id, bytes, digest, mode)
    VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (workspace_id,digest) DO NOTHING`,
    [id, workspaceId, bundle.bundle_id, bytes, digest, bundle.mode],
  );
  const row = await pool.query<{ id: string }>(
    'SELECT id FROM ops.evidence_drafts WHERE workspace_id=$1 AND digest=$2',
    [workspaceId, digest],
  );
  return { id: row.rows[0]!.id, digest, state: 'untrusted-draft', mode: bundle.mode };
}

/** Projection cannot relabel imported agent work as an application's configured model run. */
export async function projectResearchEvidence(pool: Pool, workspaceId: string, runId: string) {
  const run = (await getResearchRun(pool, workspaceId, runId)) as {
    state: string;
    modelIdentifier: string | null;
    protocolVersion: string;
    candidates: ResearchCandidate[];
    proposals: Array<{ proposalType: string; output: ResearchSynthesisProposal }>;
    receipt: unknown;
    finishedAt: string;
    operations: Array<{ sourceKey: string; state: string }>;
  };
  if (run.state !== 'complete' || run.protocolVersion !== 'research-protocol-v2')
    throw new DomainValidationError('Only completed current-protocol model runs can be projected.');
  if (!run.modelIdentifier || /(?:fixture|synthetic)/i.test(run.modelIdentifier))
    throw new DomainValidationError(
      'Fixture or unidentified model runs cannot become real evidence.',
    );
  const synthesis = run.proposals.findLast((p) => p.proposalType === 'synthesis')?.output;
  if (!synthesis) throw new DomainValidationError('Completed synthesis missing.');
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
    timeout: 2000,
  }).trim();
  const sources = run.candidates.map((c) => ({
    id: c.id,
    uri: c.canonicalUri,
    title: c.title,
    source_class: c.sourceClass ?? 'unknown',
    observed_at: c.observedAt ?? null,
    independence_group: new URL(c.canonicalUri).hostname,
  }));
  const bundle: EvidenceBundle = {
    schema_version: 1,
    bundle_id: `research-${runId}`,
    mode: 'model-led',
    created_at: new Date(run.finishedAt).toISOString(),
    producer: {
      repository: 'pradeeptathineni/signals-ai',
      commit,
      protocol: 'research-protocol-v2',
    },
    need: {
      query: 'Stored model research; the private session query is omitted from public export.',
    },
    sources,
    claims: synthesis.items.map((item) => ({
      id: `claim-${item.candidateId}`,
      text: item.reason,
      source_ids: item.citationCandidateIds,
      status: 'inferred',
    })),
    candidates: synthesis.items.map((item) => {
      const candidate = run.candidates.find((c) => c.id === item.candidateId)!;
      return {
        id: candidate.id,
        name: candidate.title,
        canonical_uri: candidate.canonicalUri,
        claim_ids: [`claim-${candidate.id}`],
        disposition: 'consider',
        reason: item.reason,
        limitations: [
          ...(item.uncertainty ? [item.uncertainty] : []),
          'Model interpretation awaits explicit source-support review.',
        ],
      };
    }),
    limitations: [
      ...synthesis.limitations,
      ...(synthesis.abstentionReason ? [synthesis.abstentionReason] : []),
      'Private query omitted; no admission or installation authority inferred.',
    ],
    extensions: {
      'signals.research-lineage': {
        run_id: runId,
        // Public projection retains identity and outcomes, not free-form private receipt detail.
        model_identifier: run.modelIdentifier,
        source_outcomes: run.operations.map(({ sourceKey, state }) => ({ sourceKey, state })),
      },
    },
  };
  const bytes = JSON.stringify(bundle, null, 2) + '\n';
  const digest = evidenceDigest(bytes);
  validateEvidence(bytes, digest);
  return persistEvidenceDraft(pool, workspaceId, bytes, digest, bundle);
}

export interface EvidenceReviewInput {
  actor: 'human' | 'agent-reviewed';
  rationale: string;
  predecessorId?: string;
  blockers: string[];
}

export async function reviewEvidenceDraft(
  pool: Pool,
  workspaceId: string,
  draftId: string,
  input: EvidenceReviewInput,
) {
  if (
    !['human', 'agent-reviewed'].includes(input.actor) ||
    !input.rationale.trim() ||
    input.rationale.length > 2000 ||
    !Array.isArray(input.blockers) ||
    input.blockers.length > 20 ||
    input.blockers.some((b) => typeof b !== 'string')
  ) {
    throw new DomainValidationError(
      'Explicit bounded review actor, rationale and blockers required.',
    );
  }
  return inTransaction(pool, async (client) => {
    const draft = await client.query<{ bytes: string; digest: string }>(
      'SELECT bytes,digest FROM ops.evidence_drafts WHERE id=$1 AND workspace_id=$2 FOR UPDATE',
      [draftId, workspaceId],
    );
    if (!draft.rowCount) throw new NotFoundError('Evidence draft not found.');
    const oldReview = await client.query<{
      bundleId: string;
      actor: string;
      rationale: string;
      predecessorId: string | null;
      blockers: string[];
    }>(
      `SELECT r.bundle_id AS "bundleId",r.actor_type AS actor,r.rationale,
      b.predecessor_id AS "predecessorId",r.checks->'blockers' AS blockers
      FROM ops.evidence_reviews r JOIN catalog.evidence_bundles b ON b.id=r.bundle_id WHERE r.draft_id=$1`,
      [draftId],
    );
    if (oldReview.rowCount) {
      const prior = oldReview.rows[0]!;
      if (
        prior.actor !== input.actor ||
        prior.rationale !== input.rationale ||
        prior.predecessorId !== (input.predecessorId ?? null) ||
        JSON.stringify(prior.blockers) !== JSON.stringify(input.blockers)
      )
        throw new ConflictError('This draft already has a different immutable review.');
      return { id: prior.bundleId, actor: prior.actor, replay: true };
    }
    const { bytes, digest } = draft.rows[0]!;
    const bundle = validateEvidence(bytes, digest);
    if (
      input.blockers.length &&
      bundle.candidates.some((c) => ['trial', 'adopt'].includes(c.disposition))
    ) {
      throw new DomainValidationError('Unresolved review blockers forbid trial/adopt admission.');
    }
    let changes: string[] = [];
    if (input.predecessorId) {
      const prior = await client.query<{ bytes: string; digest: string }>(
        'SELECT bytes,digest FROM catalog.evidence_bundles WHERE id=$1 FOR UPDATE',
        [input.predecessorId],
      );
      if (!prior.rowCount) throw new NotFoundError('Predecessor evidence not found.');
      const existingSuccessor = await client.query(
        'SELECT id FROM catalog.evidence_bundles WHERE predecessor_id=$1',
        [input.predecessorId],
      );
      if (existingSuccessor.rowCount)
        throw new ConflictError('This predecessor already has an immutable successor.');
      changes = evidenceChange(
        validateEvidence(prior.rows[0]!.bytes, prior.rows[0]!.digest),
        bundle,
      );
      if (!changes.length)
        changes = ['Sources rechecked; material claims and recommendations unchanged.'];
    }
    const bundleId = newOpaqueId();
    await client.query(
      `INSERT INTO catalog.evidence_bundles (id,bundle_id,bytes,digest,predecessor_id,change_reasons)
      VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        bundleId,
        bundle.bundle_id,
        bytes,
        digest,
        input.predecessorId ?? null,
        JSON.stringify(changes),
      ],
    );
    const corpusLinks = [];
    for (const candidate of bundle.candidates.filter(
      (c) => c.claim_ids.length && c.disposition !== 'reject',
    )) {
      const candidateClaims = bundle.claims.filter((c) => candidate.claim_ids.includes(c.id));
      const link = await furnishKnowledgeDocumentWithClient(client, workspaceId, {
        title: candidate.name,
        summary: candidateClaims
          .map((c) => c.text)
          .join(' ')
          .slice(0, 2000),
        documentKind: 'resource',
        canonicalUrl: candidate.canonical_uri,
        sourceTitle: candidate.name,
        publisher: new URL(candidate.canonical_uri).hostname,
        capabilityKey: `evidence-${bundleId}-${corpusLinks.length}`,
        capabilityName: candidate.name,
        searchTerms: [candidate.name],
        limitations: [...bundle.limitations, ...candidate.limitations].slice(0, 20),
        reviewState: 'reviewed',
        provenance: {
          actor: input.actor,
          mode: bundle.mode,
          observedAt:
            candidateClaims
              .flatMap((c) => c.source_ids)
              .map((id) => bundle.sources.find((s) => s.id === id)?.observed_at)
              .find(Boolean) ?? null,
          receipt: digest,
        },
      });
      corpusLinks.push({ candidateId: candidate.id, ...link });
    }
    await client.query(
      `INSERT INTO ops.evidence_reviews (id,draft_id,bundle_id,actor_type,policy_version,rationale,checks,corpus_links)
      VALUES ($1,$2,$3,$4,'evidence-admission-v1',$5,$6,$7)`,
      [
        newOpaqueId(),
        draftId,
        bundleId,
        input.actor,
        input.rationale,
        JSON.stringify({
          digest,
          schema: 1,
          references: 'resolved',
          privacy: 'public-fields',
          blockers: input.blockers,
          sourceSupport: 'reviewer-assessed',
        }),
        JSON.stringify(corpusLinks),
      ],
    );
    return { id: bundleId, digest, actor: input.actor, corpusLinks, changes, replay: false };
  });
}

export async function exportEvidence(pool: Pool, id: string) {
  const result = await pool.query<{
    bytes: string;
    digest: string;
    predecessorId: string | null;
    changes: string[];
  }>(
    'SELECT bytes,digest,predecessor_id AS "predecessorId",change_reasons AS changes FROM catalog.evidence_bundles WHERE id=$1',
    [id],
  );
  if (!result.rowCount) throw new NotFoundError('Admitted evidence not found.');
  const row = result.rows[0]!;
  validateEvidence(row.bytes, row.digest);
  return row;
}

export async function listEvidence(pool: Pool, workspaceId: string) {
  const drafts = await pool.query(
    `SELECT d.id,d.bundle_id AS "bundleId",d.mode,d.digest,d.created_at AS "createdAt",
    r.actor_type AS actor,r.bundle_id AS "admittedId",r.rationale,r.corpus_links AS "corpusLinks"
    FROM ops.evidence_drafts d LEFT JOIN ops.evidence_reviews r ON r.draft_id=d.id
    WHERE d.workspace_id=$1 ORDER BY d.created_at DESC,d.id LIMIT 100`,
    [workspaceId],
  );
  return { items: drafts.rows };
}

export async function getEvidenceDraft(pool: Pool, workspaceId: string, id: string) {
  const row = await pool.query<{ bytes: string; digest: string }>(
    'SELECT bytes,digest FROM ops.evidence_drafts WHERE workspace_id=$1 AND id=$2',
    [workspaceId, id],
  );
  if (!row.rowCount) throw new NotFoundError('Evidence draft not found.');
  validateEvidence(row.rows[0]!.bytes, row.rows[0]!.digest);
  return row.rows[0]!;
}

export interface EvidenceFeedbackInput {
  candidateId: string;
  consumerTask: string;
  outcome: 'useful' | 'failed' | 'regressed' | 'not_used';
  detail: string;
  idempotencyKey: string;
}
export async function recordEvidenceFeedback(
  pool: Pool,
  workspaceId: string,
  id: string,
  input: EvidenceFeedbackInput,
) {
  if (
    !['useful', 'failed', 'regressed', 'not_used'].includes(input.outcome) ||
    typeof input.consumerTask !== 'string' ||
    !input.consumerTask.trim() ||
    input.consumerTask.length > 240 ||
    typeof input.detail !== 'string' ||
    !input.detail.trim() ||
    input.detail.length > 2000 ||
    typeof input.idempotencyKey !== 'string' ||
    !input.idempotencyKey.trim() ||
    input.idempotencyKey.length > 120
  ) {
    throw new DomainValidationError('Invalid bounded feedback.');
  }
  const stored = await exportEvidence(pool, id);
  const bundle = validateEvidence(stored.bytes, stored.digest);
  if (!bundle.candidates.some((c) => c.id === input.candidateId))
    throw new DomainValidationError('Feedback must bind a candidate in this exact bundle.');
  return inTransaction(pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `evidence-feedback:${workspaceId}:${input.idempotencyKey}`,
    ]);
    const existing = await client.query<{
      id: string;
      bundleId: string;
      candidateId: string;
      consumerTask: string;
      outcome: string;
      detail: string;
    }>(
      `SELECT id,bundle_id AS "bundleId",candidate_id AS "candidateId",consumer_task AS "consumerTask",outcome,detail
       FROM ops.evidence_feedback WHERE workspace_id=$1 AND idempotency_key=$2`,
      [workspaceId, input.idempotencyKey],
    );
    if (existing.rowCount) {
      const prior = existing.rows[0]!;
      if (
        prior.bundleId !== id ||
        prior.candidateId !== input.candidateId ||
        prior.consumerTask !== input.consumerTask ||
        prior.outcome !== input.outcome ||
        prior.detail !== input.detail
      )
        throw new ConflictError('Feedback idempotency key reused with different input.');
      return { id: prior.id, replay: true };
    }
    const feedbackId = newOpaqueId();
    await client.query(
      `INSERT INTO ops.evidence_feedback (id,workspace_id,bundle_id,candidate_id,consumer_task,outcome,detail,idempotency_key)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        feedbackId,
        workspaceId,
        id,
        input.candidateId,
        input.consumerTask,
        input.outcome,
        input.detail,
        input.idempotencyKey,
      ],
    );
    return {
      id: feedbackId,
      evidenceClass: 'local-observed',
      reconsider: ['failed', 'regressed'].includes(input.outcome),
      replay: false,
    };
  });
}
