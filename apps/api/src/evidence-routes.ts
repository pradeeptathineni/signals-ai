import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { Pool } from 'pg';
import {
  EvidenceDraftBodySchema,
  EvidenceReviewBodySchema,
  EvidenceFeedbackBodySchema,
} from '../../../packages/contracts/src/evidence-http.js';
import { IdParamsSchema } from '../../../packages/contracts/src/index.js';
import {
  importEvidenceDraft,
  reviewEvidenceDraft,
  exportEvidence,
  listEvidence,
  recordEvidenceFeedback,
} from '../../../packages/db/src/evidence-repository.js';
import { localWorkspaceId } from '../../../packages/seed/src/import.js';

export function registerEvidenceRoutes(app: FastifyInstance, pool: Pool) {
  const routes = app.withTypeProvider<TypeBoxTypeProvider>();
  routes.get('/api/v1/evidence-bundles', { schema: { tags: ['evidence'] } }, () =>
    listEvidence(pool, localWorkspaceId),
  );
  routes.post(
    '/api/v1/evidence-drafts',
    { schema: { tags: ['evidence'], body: EvidenceDraftBodySchema } },
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
