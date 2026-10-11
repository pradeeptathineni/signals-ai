import { Type, type Static, type TSchema } from 'typebox';
import { Value } from 'typebox/value';

const closed = { additionalProperties: false };
const short = Type.String({ minLength: 1, maxLength: 200 });
const digest = Type.String({ pattern: '^[a-f0-9]{64}$' });
const contextRecordSchema = Type.Object(
  {
    profile: short,
    project: Type.Union([Type.String({ maxLength: 2048 }), Type.Null()]),
    area: short,
    opportunity: Type.String({ maxLength: 5000 }),
    option: short,
    why: Type.String({ maxLength: 5000 }),
    evidence: Type.Array(Type.String({ maxLength: 2048 }), { maxItems: 30 }),
    limitations: Type.Array(Type.String({ maxLength: 3000 }), { maxItems: 30 }),
    next_action: Type.String({ maxLength: 5000 }),
    status: short,
    checked_ref: short,
    date: short,
    id: short,
    source_id: Type.Union([short, Type.Null()]),
    aliases: Type.Array(short, { maxItems: 30 }),
    scope: Type.Enum(['public', 'private']),
    note: Type.Optional(Type.String({ maxLength: 5000 })),
    origin: Type.Object(
      {
        owner: Type.Literal('context-ai'),
        source_commit: short,
        source_profile: short,
        ordinal: Type.Integer({ minimum: 0 }),
        source_record_sha256: digest,
        identity_basis: Type.String({ maxLength: 1000 }),
        annotations_basis: Type.String({ maxLength: 1000 }),
      },
      closed,
    ),
  },
  closed,
);
const projectSourceSchema = Type.Union([
  Type.Object(
    { kind: Type.Literal('local'), path: Type.String({ minLength: 1, maxLength: 2048 }) },
    closed,
  ),
  Type.Object(
    { kind: Type.Literal('github'), uri: Type.String({ minLength: 1, maxLength: 2048 }) },
    closed,
  ),
]);
const snapshotSchema = Type.Object(
  {
    digest,
    observedAt: Type.String({ maxLength: 40 }),
    basis: Type.Enum(['local-documents', 'github-commit']),
    revision: Type.Union([Type.String({ maxLength: 100 }), Type.Null()]),
    dirty: Type.Literal('unknown'),
    files: Type.Array(
      Type.Object(
        {
          path: short,
          digest,
          bytes: Type.Integer({ minimum: 0, maximum: 16384 }),
          excerpt: Type.String({ maxLength: 1500 }),
        },
        closed,
      ),
      { maxItems: 8 },
    ),
    gaps: Type.Array(Type.String({ maxLength: 300 }), { maxItems: 30 }),
  },
  closed,
);
const projectSchema = Type.Object(
  {
    id: Type.String({ pattern: '^project-[a-f0-9]{24}$' }),
    name: short,
    purpose: Type.String({ minLength: 1, maxLength: 3000 }),
    constraints: Type.Array(Type.String({ minLength: 1, maxLength: 500 }), { maxItems: 20 }),
    source: projectSourceSchema,
    snapshot: snapshotSchema,
    connected: Type.Boolean(),
  },
  closed,
);
export type Project = Static<typeof projectSchema>;
export const projectHistorySchema = Type.Object(
  {
    schemaVersion: Type.Literal(1),
    contextDigest: digest,
    retainedAt: Type.String({ maxLength: 40 }),
    project: projectSchema,
  },
  closed,
);
export type ProjectSource = Static<typeof projectSourceSchema>;
const opportunityInputSchema = Type.Object(
  {
    id: Type.String({ minLength: 1, maxLength: 200 }),
    title: short,
    need: Type.String({ minLength: 1, maxLength: 3000 }),
    reason: Type.String({ minLength: 1, maxLength: 3000 }),
    nextAction: Type.Enum(['learn', 'explore', 'compare', 'consider-for-trial']),
    status: Type.Enum(['open', 'saved', 'declined', 'done']),
    note: Type.String({ maxLength: 5000 }),
    scope: Type.Enum(['public', 'private']),
    findingKey: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
    projectRef: Type.Optional(short),
    evidenceRefs: Type.Optional(
      Type.Array(
        Type.Object({ uri: Type.String({ maxLength: 2048 }), label: Type.Optional(short) }, closed),
        { maxItems: 30 },
      ),
    ),
    aliases: Type.Optional(Type.Array(short, { maxItems: 20 })),
  },
  closed,
);
const opportunitySchema = Type.Object(
  {
    ...opportunityInputSchema.properties,
    projectId: Type.Optional(projectSchema.properties.id),
    projectSnapshotDigest: Type.Optional(digest),
    projectContextDigest: Type.Optional(digest),
    importedSource: Type.Optional(contextRecordSchema),
    provenance: Type.Object(
      {
        owner: Type.Enum(['signals', 'context-ai']),
        method: Type.Enum(['manual', 'migrated']),
        sourceId: short,
        sourceRevision: Type.String({ maxLength: 100 }),
        sourceDigest: digest,
        importedAt: Type.String({ maxLength: 40 }),
      },
      closed,
    ),
  },
  closed,
);
export type Opportunity = Static<typeof opportunitySchema>;
export const migrationSchema = Type.Object(
  {
    schema_version: Type.Literal(1),
    kind: Type.Literal('context-opportunities-migration'),
    source_owner: Type.Literal('context-ai'),
    destination_owner: Type.Literal('signals-ai/project-opportunities'),
    source_commit: short,
    count: Type.Integer({ minimum: 0, maximum: 2000 }),
    source_files: Type.Array(Type.Object({ path: short, sha256: digest }, closed), {
      maxItems: 100,
    }),
    records: Type.Array(contextRecordSchema, { maxItems: 2000 }),
    authority: Type.String({ maxLength: 3000 }),
    method: Type.String({ maxLength: 3000 }),
  },
  closed,
);
export const projectStateSchema = Type.Object(
  {
    schemaVersion: Type.Literal(1),
    projects: Type.Array(projectSchema, { maxItems: 100 }),
    opportunities: Type.Array(opportunitySchema, { maxItems: 2000 }),
  },
  closed,
);
export type ProjectState = Static<typeof projectStateSchema>;
export const previewRequestSchema = Type.Object({ source: projectSourceSchema }, closed);
export const registerRequestSchema = Type.Object(
  {
    previewId: Type.String({ format: 'uuid' }),
    name: short,
    purpose: projectSchema.properties.purpose,
    constraints: projectSchema.properties.constraints,
  },
  closed,
);
export const updateProjectSchema = Type.Object(
  {
    id: projectSchema.properties.id,
    name: short,
    purpose: projectSchema.properties.purpose,
    constraints: projectSchema.properties.constraints,
  },
  closed,
);
export const projectIdSchema = Type.Object({ id: projectSchema.properties.id }, closed);
export const attachSchema = Type.Object(
  {
    projectId: projectSchema.properties.id,
    findingKey: Type.String({ minLength: 1, maxLength: 300 }),
    need: opportunityInputSchema.properties.need,
    reason: opportunityInputSchema.properties.reason,
    nextAction: opportunityInputSchema.properties.nextAction,
  },
  closed,
);
export const updateOpportunitySchema = Type.Object(
  {
    id: opportunityInputSchema.properties.id,
    status: opportunityInputSchema.properties.status,
    note: opportunityInputSchema.properties.note,
  },
  closed,
);
export const associateOpportunitySchema = Type.Object(
  { id: opportunityInputSchema.properties.id, projectId: projectSchema.properties.id },
  closed,
);
export const setupRequestSchema = Type.Object(
  {
    projectId: projectSchema.properties.id,
    opportunityId: opportunityInputSchema.properties.id,
    need: Type.String({ minLength: 1, maxLength: 512 }),
    targetProfile: Type.String({ pattern: '^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$' }),
  },
  closed,
);
export const researchPreviewSchema = Type.Object(
  { id: projectSchema.properties.id, question: Type.String({ minLength: 1, maxLength: 2000 }) },
  closed,
);
export function checked<T>(schema: TSchema, input: unknown): T {
  if (!Value.Check(schema, input)) throw new Error('invalid_project_request');
  return input as T;
}
