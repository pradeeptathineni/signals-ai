import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { Pool } from 'pg';
import {
  EvidenceDraftBodySchema,
  EvidenceReviewBodySchema,
  EvidenceFeedbackBodySchema,
  AdoptionReadinessBodySchema,
} from '../../../packages/contracts/src/evidence-http.js';
import { IdParamsSchema } from '../../../packages/contracts/src/index.js';
import {
  importEvidenceDraft,
  reviewEvidenceDraft,
  exportEvidence,
  listEvidence,
  recordEvidenceFeedback,
  getEvidenceDraft,
  projectResearchEvidence,
} from '../../../packages/db/src/evidence-repository.js';
import { localWorkspaceId } from '../../../packages/seed/src/import.js';
import { recordAdoptionReadiness } from '../../../packages/db/src/adoption-repository.js';

export function registerEvidenceRoutes(app: FastifyInstance, pool: Pool) {
  const routes = app.withTypeProvider<TypeBoxTypeProvider>();
  routes.post(
    '/api/v1/evidence-bundles/:id/readiness',
    { schema: { tags: ['evidence'], params: IdParamsSchema, body: AdoptionReadinessBodySchema } },
    (request) => recordAdoptionReadiness(pool, localWorkspaceId, request.params.id, request.body),
  );
  routes.post(
    '/api/v1/research/runs/:id/evidence-draft',
    { schema: { tags: ['evidence'], params: IdParamsSchema } },
    (request) => projectResearchEvidence(pool, localWorkspaceId, request.params.id),
  );
  routes.get('/api/v1/evidence-bundles', { schema: { tags: ['evidence'] } }, () =>
    listEvidence(pool, localWorkspaceId),
  );
  routes.get(
    '/api/v1/evidence-drafts/:id',
    { schema: { tags: ['evidence'], params: IdParamsSchema } },
    (request) => getEvidenceDraft(pool, localWorkspaceId, request.params.id),
  );
  routes.post(
    '/api/v1/evidence-drafts',
    { bodyLimit: 600_000, schema: { tags: ['evidence'], body: EvidenceDraftBodySchema } },
    (request) =>
      importEvidenceDraft(pool, localWorkspaceId, request.body.bytes, request.body.digest),
  );
  routes.post(
    '/api/v1/evidence-drafts/:id/review',
    { schema: { tags: ['evidence'], params: IdParamsSchema, body: EvidenceReviewBodySchema } },
    (request) => reviewEvidenceDraft(pool, localWorkspaceId, request.params.id, request.body),
  );
  routes.get(
    '/api/v1/evidence-bundles/:id/export',
    { schema: { tags: ['evidence'], params: IdParamsSchema } },
    (request) => exportEvidence(pool, request.params.id),
  );
  routes.post(
    '/api/v1/evidence-bundles/:id/feedback',
    { schema: { tags: ['evidence'], params: IdParamsSchema, body: EvidenceFeedbackBodySchema } },
    (request) => recordEvidenceFeedback(pool, localWorkspaceId, request.params.id, request.body),
  );
}
