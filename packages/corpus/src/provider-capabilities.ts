import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Type, type Static } from 'typebox';
import { Value } from 'typebox/value';
import manifest from '../../../package.json' with { type: 'json' };
import { requestStore } from './search-request-store.js';
import { loadRun } from './search-store.js';

const closed = { additionalProperties: false };
const text = Type.String({ minLength: 1, maxLength: 200 });
const digest = Type.String({ pattern: '^[a-f0-9]{64}$' });
const recordRef = Type.Object(
  {
    owner: text,
    kind: text,
    id: text,
    revision: Type.Union([text, Type.Null()]),
    digest: Type.Union([digest, Type.Null()]),
  },
  closed,
);
const capabilitiesSchema = Type.Object(
  {
    schema_version: Type.Literal('1.0'),
    owner: Type.Literal('signals-ai'),
    instance_id: text,
    product_version: text,
    contracts: Type.Array(Type.Object({ id: text, versions: Type.Array(text) }, closed)),
    operations: Type.Array(
      Type.Object(
        {
          name: text,
          target_kinds: Type.Array(text),
          mutating: Type.Boolean(),
          authority_required: Type.Boolean(),
        },
        closed,
      ),
    ),
    record_kinds: Type.Array(text),
    process_observation: Type.Boolean(),
    observed_at: Type.String({ format: 'date-time' }),
    availability: Type.Enum(['available', 'unavailable', 'unsupported']),
    reason: Type.String(),
  },
  closed,
);
const recordSchema = Type.Object(
  {
    schema_version: Type.Literal('1.0'),
    ref: recordRef,
    instance_id: text,
    owner_epoch: text,
    content_type: Type.Literal('application/json'),
    encoding: Type.Literal('utf8'),
    content: Type.String({ maxLength: 2_000_000 }),
    storage: Type.Literal('retained_run_snapshot'),
  },
  closed,
);
type OwnerRef = Static<typeof recordRef>;

export class ProviderError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly reason: string,
  ) {
    super(code);
  }
}
const fail = (status: number, code: string, reason: string): never => {
  throw new ProviderError(status, code, reason);
};
async function ownerScope(
  root: string,
  version: unknown,
  instance: unknown,
  epoch: unknown,
  required: boolean,
) {
  if (version !== undefined && version !== '1.0')
    fail(
      426,
      'unsupported_provider_version',
      'This owner supports provider version 1.0. Configure that version explicitly; no version substitution is performed.',
    );
  let scope: Awaited<ReturnType<ReturnType<typeof requestStore>['scope']>>;
  try {
    scope = await requestStore(root).scope();
  } catch {
    return fail(
      503,
      'provider_unavailable',
      'Signals owner scope is unavailable. Explicitly initialize only a fresh workspace via request-scope; reconcile missing or corrupt existing history locally.',
    );
  }
  if (required && (typeof instance !== 'string' || typeof epoch !== 'string'))
    fail(
      428,
      'provider_owner_binding_required',
      'Bind the trusted instance_id and owner epoch from capabilities before reading an owner record.',
    );
  if (instance !== undefined && instance !== scope.identity)
    fail(
      409,
      'provider_instance_mismatch',
      'Configured Signals instance differs from this owner. Inspect trusted registration; do not silently rebind.',
    );
  if (epoch !== undefined && epoch !== scope.epoch)
    fail(
      409,
      'owner_epoch_mismatch',
      'Owner history epoch changed. Reconcile the original scope before continuing.',
    );
  return scope;
}

/** Opt-in negotiation headers also bind existing actions before body/effects. */
export async function validateProviderHeaders(
  root: string,
  version: unknown,
  instance: unknown,
  epoch: unknown,
) {
  if (version !== undefined && version !== '1.0')
    fail(
      426,
      'unsupported_provider_version',
      'This owner supports provider version 1.0. No action was dispatched under another version.',
    );
  if (instance !== undefined) await ownerScope(root, version, instance, epoch, false);
}

export async function providerCapabilities(
  root: string,
  version: unknown,
  instance: unknown,
  epoch: unknown,
) {
  const scope = await ownerScope(root, version, instance, epoch, false);
  const capabilities = {
    schema_version: '1.0',
    owner: 'signals-ai',
    instance_id: scope.identity,
    product_version: manifest.version,
    contracts: ['K01', 'K12', 'K14', 'K15'].map((id) => ({ id, versions: ['1.0'] })),
    operations: [
      {
        name: 'read_record',
        target_kinds: ['answer', 'research_run'],
        mutating: false,
        authority_required: false,
      },
      {
        name: 'lookup_request',
        target_kinds: ['research_request'],
        mutating: false,
        authority_required: false,
      },
      {
        name: 'request_configuration',
        target_kinds: ['execution_configuration'],
        mutating: false,
        authority_required: false,
      },
      {
        name: 'search',
        target_kinds: ['research_request'],
        mutating: true,
        authority_required: true,
      },
      { name: 'cancel', target_kinds: ['research_job'], mutating: true, authority_required: true },
    ],
    record_kinds: ['answer', 'research_run'],
    process_observation: false,
    observed_at: new Date().toISOString(),
    availability: 'available',
    reason:
      'Owner HTTP contract available. Native model readiness is separate and was not probed; retained history is not automatically a saved Library answer.',
  };
  if (!Value.Check(capabilitiesSchema, capabilities))
    fail(
      503,
      'invalid_provider_capabilities',
      'Installed provider metadata could not be validated.',
    );
  return {
    capabilities,
    deduplication: scope,
    access: {
      base_path: '/signals-ai/__signals/api/',
      transport: 'loopback-http',
      origin: 'same-origin-or-no-origin',
      mutation_authentication: 'session token in x-signals-token; existing origin checks apply',
      record_owner_headers: ['x-signals-instance-id', 'x-signals-owner-epoch'],
      read_route: 'provider/records?ref=<encoded RecordRef>',
      supported_records:
        'Private retained run snapshots only; no arbitrary file paths, commands, legacy query imports or process snapshots.',
    },
  };
}

async function snapshotBytes(root: string, id: string) {
  const path = resolve(root, '.signals/runs', id + '.json');
  try {
    if ((await realpath(path)) !== path)
      fail(503, 'provider_record_unavailable', 'Retained record storage must not follow symlinks.');
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > 2_000_000)
        fail(
          503,
          'provider_record_unavailable',
          'Retained record is not a supported bounded snapshot.',
        );
      const bytes = await file.readFile();
      if (bytes.length > 2_000_000 || !Buffer.from(bytes.toString('utf8')).equals(bytes))
        fail(503, 'provider_record_unavailable', 'Retained record must be bounded UTF8 JSON.');
      return bytes;
    } finally {
      await file.close();
    }
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return fail(
        404,
        'provider_record_not_found',
        'This snapshot is not retained here. Lookup never starts research or recreates an answer.',
      );
    return fail(
      503,
      'provider_record_unavailable',
      'Retained record could not be read safely. Inspect owner history locally.',
    );
  }
}
export async function providerRecord(
  root: string,
  url: string,
  version: unknown,
  instance: unknown,
  epoch: unknown,
) {
  const scope = await ownerScope(root, version, instance, epoch, true);
  const params = new URL(url, 'http://127.0.0.1').searchParams;
  let ref: OwnerRef;
  try {
    if (params.size !== 1 || !params.has('ref') || params.get('ref')!.length > 2000)
      throw new Error();
    const input: unknown = JSON.parse(params.get('ref')!);
    if (!Value.Check(recordRef, input)) throw new Error();
    ref = input;
  } catch {
    return fail(
      400,
      'invalid_provider_reference',
      'Supply one closed RecordRef in ref; commands, paths and extra fields are not accepted.',
    );
  }
  if (ref.owner !== 'signals-ai')
    fail(
      409,
      'provider_owner_mismatch',
      'The reference belongs to another owner. Use its explicitly registered endpoint.',
    );
  if (!['answer', 'research_run'].includes(ref.kind))
    fail(
      400,
      'unsupported_record_kind',
      'This provider revision reads retained answer and research_run snapshots only.',
    );
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(ref.id))
    fail(
      400,
      'invalid_provider_reference',
      'Retained run IDs must be UUIDs, never paths or open commands.',
    );
  const bytes = await snapshotBytes(root, ref.id);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const revision = 'sha256:' + sha256;
  if (
    (ref.digest !== null && ref.digest !== sha256) ||
    (ref.revision !== null && ref.revision !== revision)
  )
    fail(
      409,
      'provider_record_changed',
      'The exact requested revision/digest is unavailable. Resolve a successor explicitly; no substitution was made.',
    );
  try {
    const validated = await loadRun(ref.id, root);
    if (
      !['completed', 'partial', 'failed', 'cancelled', 'not_configured'].includes(
        validated.status,
      ) ||
      (ref.kind === 'answer' && !validated.answerReceipt)
    )
      throw new Error('unsupported_retained_record');
  } catch {
    return fail(
      503,
      'provider_record_unavailable',
      'Retained snapshot validation failed. Inspect owner history locally; no inference fallback is available.',
    );
  }
  if (!(await snapshotBytes(root, ref.id)).equals(bytes))
    fail(
      409,
      'provider_record_changed',
      'Snapshot changed while it was being validated. Retry the exact reference after owner reconciliation.',
    );
  const result = {
    schema_version: '1.0',
    ref: { ...ref, revision, digest: sha256 },
    instance_id: scope.identity,
    owner_epoch: scope.epoch,
    content_type: 'application/json',
    encoding: 'utf8',
    content: bytes.toString('utf8'),
    storage: 'retained_run_snapshot',
  };
  if (!Value.Check(recordSchema, result))
    fail(503, 'provider_record_unavailable', 'Stored record response failed its runtime contract.');
  return result;
}
