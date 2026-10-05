import { Type } from 'typebox';

export const EvidenceDraftBodySchema = Type.Object(
  {
    bytes: Type.String({ minLength: 1, maxLength: 262144 }),
    digest: Type.String({ pattern: '^[a-f0-9]{64}$' }),
  },
  { additionalProperties: false },
);
export const EvidenceReviewBodySchema = Type.Object(
  {
    actor: Type.Union([Type.Literal('human'), Type.Literal('agent-reviewed')]),
    rationale: Type.String({ minLength: 1, maxLength: 2000 }),
    blockers: Type.Array(Type.String({ minLength: 1, maxLength: 500 }), { maxItems: 20 }),
    predecessorId: Type.Optional(Type.String({ format: 'uuid' })),
  },
  { additionalProperties: false },
);
export const EvidenceFeedbackBodySchema = Type.Object(
  {
    candidateId: Type.String({ minLength: 1, maxLength: 120 }),
    consumerTask: Type.String({ minLength: 1, maxLength: 240 }),
    outcome: Type.Union([
      Type.Literal('useful'),
      Type.Literal('failed'),
      Type.Literal('regressed'),
      Type.Literal('not_used'),
    ]),
    detail: Type.String({ minLength: 1, maxLength: 2000 }),
    idempotencyKey: Type.String({ minLength: 1, maxLength: 120 }),
  },
  { additionalProperties: false },
);
