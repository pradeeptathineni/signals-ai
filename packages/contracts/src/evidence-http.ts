import { Type } from 'typebox';

export const AdoptionReadinessBodySchema = Type.Object(
  {
    candidateId: Type.String({ minLength: 1, maxLength: 120 }),
    actor: Type.Union([Type.Literal('human'), Type.Literal('agent-reviewed')]),
    purpose: Type.Union([
      Type.Literal('reference'),
      Type.Literal('use'),
      Type.Literal('copy'),
      Type.Literal('production'),
      Type.Literal('comparison'),
    ]),
    supportedClaimIds: Type.Array(Type.String({ minLength: 1, maxLength: 120 }), {
      maxItems: 100,
      uniqueItems: true,
    }),
    documentedInterface: Type.Boolean(),
    boundedCheck: Type.Union([
      Type.Literal('passed'),
      Type.Literal('failed'),
      Type.Literal('unknown'),
    ]),
    compatibility: Type.Union([
      Type.Literal('compatible'),
      Type.Literal('incompatible'),
      Type.Literal('unknown'),
    ]),
    redistribution: Type.Union([
      Type.Literal('allowed'),
      Type.Literal('prohibited'),
      Type.Literal('unknown'),
    ]),
    authoritySafe: Type.Boolean(),
    criticalClaimSupported: Type.Boolean(),
    unknowns: Type.Array(Type.String({ minLength: 1, maxLength: 500 }), { maxItems: 20 }),
    feedbackId: Type.Optional(Type.String({ format: 'uuid' })),
  },
  { additionalProperties: false },
);

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
