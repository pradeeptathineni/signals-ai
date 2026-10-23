import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, realpath, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Type, type Static } from 'typebox';
import { Value } from 'typebox/value';
import manifest from '../../../package.json' with { type: 'json' };
import { requestStore } from './search-request-store.js';
import { loadRun } from './search-store.js';
import { loadEntities } from './search-store.js';
import { loadLibrary } from './library.js';
import { loadLibraryLeads } from './library-leads.js';
import { importedAnswers } from './research-receipts.js';
import { loadProjects } from './projects.js';
import { searchLibrary, type LibraryFinding } from '../../domain/src/library-search.js';
import { sourceCaptureRecordBytes, SourceCaptureError } from './source-captures.js';

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
    storage: Type.Enum([
      'retained_run_snapshot',
      'imported_answer_snapshot',
      'entity_snapshot',
      'lead_record',
      'project_record',
      'source_capture_record',
      'source_annotation_record',
    ]),
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

export async function validateProcessObserver(
  root: string,
  version: unknown,
  instance: unknown,
  epoch: unknown,
) {
  await ownerScope(root, version, instance, epoch, true);
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
    contracts: [
      ...['K01', 'K12', 'K13', 'K14', 'K15'].map((id) => ({ id, versions: ['1.0'] })),
      { id: 'source-capture', versions: ['1.0'] },
      { id: 'frozen-followup-request', versions: ['1.0', '2.0'] },
    ],
    operations: [
      {
        name: 'search_knowledge',
        target_kinds: [
          'answer',
          'research_note',
          'imported_answer',
          'entity',
          'lead',
          'decision',
          'review',
          'reflection',
          'principle',
          'study-session',
        ],
        mutating: false,
        authority_required: false,
      },
      {
        name: 'read_knowledge',
        target_kinds: ['owner_reference'],
        mutating: false,
        authority_required: false,
      },
      { name: 'read_topics', target_kinds: ['topic'], mutating: false, authority_required: false },
      { name: 'edit_topics', target_kinds: ['topic'], mutating: true, authority_required: true },
      {
        name: 'observe_processes',
        target_kinds: ['research_job', 'research_request'],
        mutating: false,
        authority_required: false,
      },
      {
        name: 'read_record',
        target_kinds: [
          'answer',
          'research_run',
          'research_note',
          'imported_answer',
          'entity',
          'lead',
          'project',
          'source_capture',
          'source_annotation',
        ],
        mutating: false,
        authority_required: false,
      },
      {
        name: 'capture_source',
        target_kinds: ['source_capture'],
        mutating: true,
        authority_required: true,
      },
      {
        name: 'read_source_captures',
        target_kinds: ['source_capture', 'source_annotation'],
        mutating: false,
        authority_required: false,
      },
      {
        name: 'annotate_source',
        target_kinds: ['source_annotation'],
        mutating: true,
        authority_required: true,
      },
      {
        name: 'select_source_capture',
        target_kinds: ['source_capture', 'source_annotation'],
        mutating: false,
        authority_required: false,
      },
      {
        name: 'search_library',
        target_kinds: ['answer', 'research_note', 'imported_answer', 'entity', 'lead'],
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
      {
        name: 'ask_saved_research',
        target_kinds: ['answer', 'research_note'],
        mutating: true,
        authority_required: true,
      },
      {
        name: 'ask_across_saved_research',
        target_kinds: ['answer', 'research_note'],
        mutating: true,
        authority_required: true,
      },
      {
        name: 'lookup_followup',
        target_kinds: ['followup_request'],
        mutating: false,
        authority_required: false,
      },
    ],
    record_kinds: [
      'answer',
      'research_run',
      'research_note',
      'imported_answer',
      'entity',
      'lead',
      'project',
      'source_capture',
      'source_annotation',
    ],
    process_observation: true,
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
      library_route:
        'provider/library?q=<literal Unicode text>&limit=<1..100>&kinds=<comma-separated supported kinds>&project_ref=<encoded RecordRef>&cursor=<opaque>',
      knowledge_route:
        'provider/knowledge?q=<literal text>&limit=<1..100>; knowledge/record reads an exact selected owner reference; topics supports private named collections. Foreign readers are operator-configured frozen export files.',
      followup_route:
        'followups (frozen-followup-request-v1 or v2, session token and owner epoch); followups/<idempotency_key> reads it back',
      supported_records:
        'Qualified retained runs, imported answers, native entities, selected leads and project records. Library summaries are bounded; process observations use provider/processes. No arbitrary paths or commands.',
    },
  };
}

async function fileBytes(path: string) {
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
const snapshotBytes = (root: string, id: string) =>
  fileBytes(resolve(root, '.signals/runs', id + '.json'));
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const entityId = /^entity-[a-f0-9]{24}$/;
const leadId = /^lead-[a-f0-9]{24}$/;
const projectId = /^project-[a-f0-9]{24}$/;
type RecordStorage = Static<typeof recordSchema>['storage'];
function projectedBytes(value: unknown) {
  const bytes = Buffer.from(JSON.stringify(value));
  if (bytes.length > 2_000_000)
    fail(
      503,
      'provider_record_unavailable',
      'Validated owner projection exceeds the bounded record response.',
    );
  return bytes;
}
/** Resolve only a supported owner's validated record; no path is supplied by a consumer. */
async function ownedBytes(
  root: string,
  kind: string,
  id: string,
): Promise<{ bytes: Buffer; storage: RecordStorage }> {
  if (['answer', 'research_run', 'research_note'].includes(kind)) {
    if (!uuid.test(id)) fail(400, 'invalid_provider_reference', 'Retained run IDs must be UUIDs.');
    const bytes = await snapshotBytes(root, id);
    try {
      const run = await loadRun(id, root);
      if (!['completed', 'partial', 'failed', 'cancelled', 'not_configured'].includes(run.status))
        throw new Error('unsupported_retained_status');
      if (kind === 'answer' && !run.answerReceipt) throw new Error();
      if (
        kind === 'research_note' &&
        (run.answerReceipt ||
          !['partial', 'failed', 'cancelled'].includes(run.status) ||
          !run.brief?.text)
      )
        throw new Error();
    } catch {
      fail(503, 'provider_record_unavailable', 'Retained snapshot validation failed.');
    }
    return { bytes, storage: 'retained_run_snapshot' };
  }
  if (kind === 'imported_answer') {
    if (!uuid.test(id))
      fail(400, 'invalid_provider_reference', 'Imported answer IDs must be UUIDs.');
    if (!(await importedAnswers(root)).some((run) => run.runId === id))
      fail(404, 'provider_record_not_found', 'No validated imported answer has this identity.');
    for (const name of await readdir(resolve(root, '.signals/queries')).catch(() => [])) {
      if (!uuid.test(name.replace(/\.json$/, '')) || !name.endsWith('.json')) continue;
      const bytes = await fileBytes(resolve(root, '.signals/queries', name));
      try {
        const record = JSON.parse(bytes.toString('utf8')) as { result?: { runId?: string } };
        if (record.result?.runId === id) return { bytes, storage: 'imported_answer_snapshot' };
      } catch {
        fail(503, 'provider_record_unavailable', 'Imported answer original is invalid.');
      }
    }
    return fail(404, 'provider_record_not_found', 'Imported answer original is unavailable.');
  }
  if (kind === 'entity') {
    const match = /^(public|private):(entity-[a-f0-9]{24})$/.exec(id);
    if (!match || !entityId.test(match[2]!))
      return fail(
        400,
        'invalid_provider_reference',
        'Entity IDs require their public or private destination.',
      );
    const directory = resolve(
      root,
      match[1] === 'public' ? 'signals/entities' : '.signals/corpus/entities',
    );
    if (!(await loadEntities(directory)).some((record) => record.entity.id === match[2]))
      fail(404, 'provider_record_not_found', 'Validated entity is unavailable.');
    return {
      bytes: await fileBytes(resolve(directory, match[2] + '.json')),
      storage: 'entity_snapshot',
    };
  }
  if (kind === 'lead') {
    if (!leadId.test(id)) fail(400, 'invalid_provider_reference', 'Invalid lead identity.');
    const lead = (await loadLibraryLeads(root)).find((row) => row.id === id);
    if (!lead) return fail(404, 'provider_record_not_found', 'Validated lead is unavailable.');
    return {
      bytes: projectedBytes({ id, uri: lead.uri, history: lead.lead!.history }),
      storage: 'lead_record',
    };
  }
  if (kind === 'project') {
    if (!projectId.test(id)) fail(400, 'invalid_provider_reference', 'Invalid project identity.');
    const project = (await loadProjects(root)).projects.find((row) => row.id === id);
    if (!project)
      return fail(404, 'provider_record_not_found', 'Validated project is unavailable.');
    return { bytes: projectedBytes(project), storage: 'project_record' };
  }
  if (kind === 'source_capture' || kind === 'source_annotation') {
    if (!uuid.test(id))
      fail(400, 'invalid_provider_reference', 'Source-capture record IDs must be UUIDs.');
    try {
      return await sourceCaptureRecordBytes(root, kind, id);
    } catch (error) {
      if (error instanceof SourceCaptureError) fail(error.status, error.code, error.reason);
      throw error;
    }
  }
  return fail(400, 'unsupported_record_kind', 'This owner does not read that record kind.');
}
/** Exact validated bytes of one owner record; a changed revision is refused, never substituted. */
export async function exactOwnerRecord(root: string, ref: OwnerRef) {
  const { bytes, storage } = await ownedBytes(root, ref.kind, ref.id);
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
  if (!(await ownedBytes(root, ref.kind, ref.id)).bytes.equals(bytes))
    fail(
      409,
      'provider_record_changed',
      'Snapshot changed while it was being validated. Retry the exact reference after owner reconciliation.',
    );
  return { bytes, storage, ref: { ...ref, revision, digest: sha256 } };
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
  const exact = await exactOwnerRecord(root, ref);
  const result = {
    schema_version: '1.0',
    ref: exact.ref,
    instance_id: scope.identity,
    owner_epoch: scope.epoch,
    content_type: 'application/json',
    encoding: 'utf8',
    content: exact.bytes.toString('utf8'),
    storage: exact.storage,
  };
  if (!Value.Check(recordSchema, result))
    fail(503, 'provider_record_unavailable', 'Stored record response failed its runtime contract.');
  return result;
}

const libraryKinds = ['answer', 'research_note', 'imported_answer', 'entity', 'lead'] as const;
async function libraryIdentity(root: string, finding: LibraryFinding) {
  if (finding.origin.format === 'native')
    return { kind: 'entity', id: `${finding.origin.destination}:${finding.id}` };
  if (finding.origin.format === 'lead') return { kind: 'lead', id: finding.id };
  if (finding.origin.format === 'note') return { kind: 'research_note', id: finding.id };
  if (finding.origin.format === 'answer') {
    try {
      await snapshotBytes(root, finding.id);
      return { kind: 'answer', id: finding.id };
    } catch (error) {
      if (!(error instanceof ProviderError) || error.status !== 404) throw error;
      return { kind: 'imported_answer', id: finding.id };
    }
  }
  return null; // Legacy bundles do not yet have an exact per-record reader.
}

/** K12: a bounded, owner-qualified navigation page over current saved Library records. */
export async function providerLibrary(
  root: string,
  url: string,
  version: unknown,
  instance: unknown,
  epoch: unknown,
) {
  await ownerScope(root, version, instance, epoch, true);
  const params = new URL(url, 'http://127.0.0.1').searchParams;
  if (
    [...params.keys()].some(
      (key) => !['q', 'limit', 'kinds', 'project_ref', 'cursor'].includes(key),
    ) ||
    [...params.keys()].some((key) => params.getAll(key).length !== 1)
  )
    fail(400, 'invalid_library_query', 'Unknown or repeated Library filters are not supported.');
  const q = params.get('q') ?? '';
  const limitText = params.get('limit') ?? '30';
  if (q.length > 2000 || !/^[1-9]\d*$/.test(limitText) || Number(limitText) > 100)
    fail(400, 'invalid_library_query', 'Query text must be bounded and limit must be 1..100.');
  const limit = Number(limitText);
  const kindsText = params.get('kinds');
  const kinds = kindsText === null ? [...libraryKinds] : kindsText.split(',');
  if (
    !kinds.length ||
    kinds.some((kind) => !libraryKinds.includes(kind as (typeof libraryKinds)[number])) ||
    new Set(kinds).size !== kinds.length
  )
    fail(400, 'unsupported_library_filter', 'Supply only advertised owner Library kinds.');
  let projectFilter: OwnerRef | null = null;
  if (params.has('project_ref')) {
    try {
      const candidate: unknown = JSON.parse(params.get('project_ref')!);
      if (
        !Value.Check(recordRef, candidate) ||
        candidate.owner !== 'signals-ai' ||
        candidate.kind !== 'project'
      )
        throw new Error();
      projectFilter = candidate;
    } catch {
      fail(
        400,
        'unsupported_library_filter',
        'Project filter must be a Signals project RecordRef.',
      );
    }
    const current = await ownedBytes(root, 'project', projectFilter!.id);
    const sha = createHash('sha256').update(current.bytes).digest('hex');
    if (
      (projectFilter!.digest && projectFilter!.digest !== sha) ||
      (projectFilter!.revision && projectFilter!.revision !== `sha256:${sha}`)
    )
      fail(
        409,
        'provider_record_changed',
        'Project filter version changed; refresh its exact owner reference.',
      );
  }
  const projectState = await loadProjects(root);
  const associations = new Map<string, string[]>();
  for (const item of projectState.opportunities) {
    if (!item.findingKey || !item.projectId) continue;
    const ids = associations.get(item.findingKey) ?? [];
    if (!ids.includes(item.projectId)) ids.push(item.projectId);
    associations.set(item.findingKey, ids);
  }
  const coverage: string[] = [];
  const findings = (await loadLibrary(root, { coverage })).filter((finding) => finding.saved);
  const hits = searchLibrary(findings, q).filter(
    ({ finding }) => !projectFilter || associations.get(finding.key)?.includes(projectFilter.id),
  );
  if (!q.trim())
    hits.sort(
      (a, b) =>
        (b.finding.observedAt ?? '').localeCompare(a.finding.observedAt ?? '') ||
        a.finding.key.localeCompare(b.finding.key),
    );
  const observedAt = new Date().toISOString();
  const summaries = [];
  for (const { finding } of hits) {
    const identity = await libraryIdentity(root, finding);
    if (!identity || !kinds.includes(identity.kind)) continue;
    let digestValue: string | null = null;
    let available = true;
    try {
      digestValue = createHash('sha256')
        .update((await ownedBytes(root, identity.kind, identity.id)).bytes)
        .digest('hex');
    } catch (error) {
      if (!(error instanceof ProviderError) || ![404, 503].includes(error.status)) throw error;
      available = false;
    }
    const projectRefs = [];
    for (const id of associations.get(finding.key) ?? []) {
      const project = projectState.projects.find((row) => row.id === id);
      if (!project) continue;
      const sha = createHash('sha256').update(JSON.stringify(project)).digest('hex');
      projectRefs.push({
        owner: 'signals-ai',
        kind: 'project',
        id,
        revision: `sha256:${sha}`,
        digest: sha,
      });
    }
    summaries.push({
      ref: {
        owner: 'signals-ai',
        ...identity,
        revision: digestValue ? `sha256:${digestValue}` : null,
        digest: digestValue,
      },
      title: finding.title,
      summary: finding.description.slice(0, 400),
      kind: identity.kind,
      project_refs: projectRefs,
      updated_at: finding.observedAt,
      visibility: finding.origin.destination,
      domain_status: finding.partialNote
        ? `incomplete:${finding.partialNote.status}`
        : finding.answer
          ? 'unassessed-answer'
          : finding.intrinsicStrength.policy,
      open_capability: available ? 'owner_route' : 'unavailable',
      observed_at: observedAt,
    });
  }
  const snapshot = createHash('sha256')
    .update(
      JSON.stringify({
        q,
        kinds,
        projectFilter,
        summaries: summaries.map((summary) => ({ ...summary, observed_at: null })),
      }),
    )
    .digest('hex');
  const cursor = params.get('cursor');
  let offset = 0;
  if (cursor !== null) {
    try {
      if (cursor.length > 512) throw new Error();
      const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
        snapshot: string;
        offset: number;
      };
      if (
        parsed.snapshot !== snapshot ||
        !Number.isSafeInteger(parsed.offset) ||
        parsed.offset < 1 ||
        parsed.offset >= summaries.length
      )
        throw new Error();
      offset = parsed.offset;
    } catch {
      fail(
        409,
        'library_cursor_changed',
        'Library page changed or cursor is invalid; restart from the first page.',
      );
    }
  }
  const next =
    offset + limit < summaries.length
      ? Buffer.from(JSON.stringify({ snapshot, offset: offset + limit })).toString('base64url')
      : null;
  return {
    schema_version: '1.0',
    records: summaries.slice(offset, offset + limit),
    next_cursor: next,
    owner_coverage: [
      {
        owner: 'signals-ai',
        state: 'connected',
        observed_at: observedAt,
        reason: `Saved supported records searched; legacy published bundles lack exact per-record reads and are excluded.${coverage.length ? ` Partial coverage: ${coverage.join(' ')}` : ''}`,
      },
    ],
  };
}
