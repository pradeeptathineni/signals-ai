import { randomUUID } from 'node:crypto';
import { readFile, unlink, readdir, lstat, realpath } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { Type, type Static } from 'typebox';
import { Value } from 'typebox/value';
import { loadSettings, type SearchSettings } from './search-settings.js';
import { atomicJson, retainRun, saveEntities, withWriter } from './search-store.js';
import { signalSearch } from './signal-search.js';
import { codexRunner } from './search-runner.js';
import { parseRequest, budgets } from '../../domain/src/search-contract.js';

const batchSchema = Type.Object(
  {
    id: Type.String({ pattern: '^[a-f0-9-]{36}$' }),
    createdAt: Type.String(),
    jobs: Type.Array(
      Type.Object(
        {
          id: Type.String(),
          query: Type.String(),
          context: Type.Optional(Type.String()),
          concepts: Type.Array(Type.String()),
          supplementalSites: Type.Array(Type.String()),
          status: Type.Enum([
            'pending',
            'running',
            'completed',
            'partial',
            'failed',
            'cancelled',
            'uncertain',
          ]),
          runId: Type.Optional(Type.String()),
          saved: Type.Array(Type.String()),
          gaps: Type.Array(Type.String()),
        },
        { additionalProperties: false },
      ),
      { maxItems: 512 },
    ),
  },
  { additionalProperties: false },
);
export type QueryBatch = Static<typeof batchSchema>;
export async function loadQueryBatch(id: string, root = process.cwd()) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('invalid_batch_id');
  const path = resolve(root, '.signals/query-batches', `${id}.json`);
  const stat = await lstat(path);
  if (
    stat.isSymbolicLink() ||
    stat.size > 8000000 ||
    !relative(await realpath(root), await realpath(path)).startsWith('.signals/query-batches/')
  )
    throw new Error('unsafe_query_batch');
  const raw: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (
    !Value.Check(batchSchema, raw) ||
    raw.id !== id ||
    new Set(raw.jobs.map((job) => job.id)).size !== raw.jobs.length
  )
    throw new Error('invalid_query_batch');
  raw.jobs.forEach((job) =>
    parseRequest({
      query: job.query,
      context: job.context,
      supplementalSites: job.supplementalSites,
    }),
  );
  return raw;
}
export async function queryBatchHistory(root = process.cwd()) {
  const directory = resolve(root, '.signals/query-batches');
  const files = await readdir(directory).catch((error) => {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return [] as string[];
  });
  const candidates = await Promise.all(
    files
      .filter((name) => /^[a-f0-9-]{36}\.json$/.test(name))
      .map(async (name) => ({ name, stat: await lstat(resolve(directory, name)) })),
  );
  const batches = await Promise.all(
    candidates
      .filter((item) => !item.stat.isSymbolicLink())
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
      .slice(0, 30)
      .map((item) => loadQueryBatch(item.name.slice(0, -5), root)),
  );
  return batches.map((batch) => ({
    id: batch.id,
    createdAt: batch.createdAt,
    total: batch.jobs.length,
    pending: batch.jobs.filter((job) => job.status === 'pending').length,
    uncertain: batch.jobs.filter((job) => job.status === 'running' || job.status === 'uncertain')
      .length,
  }));
}

/** Explicit one-shot activation snapshots the selected interests; it never enables recurrence. */
type BatchOptions = {
  root?: string;
  settings?: SearchSettings;
  ids?: string[];
  resume?: string;
  limit?: number;
  signal?: AbortSignal;
  progress?: (event: string) => void;
  search?: typeof signalSearch;
};
export async function runQueryListOnce(options: BatchOptions = {}) {
  const root = options.root ?? process.cwd();
  const id = options.resume ?? randomUUID();
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('invalid_batch_id');
  const lease = resolve(root, '.signals/query-batches', `${id}.lease.json`);
  await withWriter(root, async () => {
    const owner = JSON.parse(
      await readFile(lease, 'utf8').catch((error) => {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        return 'null';
      }),
    ) as { pid: number } | null;
    if (owner) {
      if (!Number.isInteger(owner.pid) || owner.pid < 1) throw new Error('invalid_batch_lease');
      let alive = true;
      try {
        process.kill(owner.pid, 0);
      } catch {
        alive = false;
      }
      if (alive) throw new Error('query_batch_busy');
    }
    await atomicJson(lease, { pid: process.pid });
  });
  try {
    return await executeBatch(options, id);
  } finally {
    await unlink(lease);
  }
}
async function executeBatch(options: BatchOptions, batchId: string) {
  const root = options.root ?? process.cwd();
  const settings = options.settings ?? (await loadSettings(root));
  const limit = options.limit ?? settings.batchSize;
  if (!Number.isInteger(limit) || limit < 1 || limit > 512)
    throw new Error('invalid_query_batch_limit');
  if (!/^[a-f0-9-]{36}$/.test(batchId)) throw new Error('invalid_batch_id');
  const path = resolve(root, '.signals/query-batches', `${batchId}.json`);
  let batch: QueryBatch;
  if (options.resume) {
    batch = await loadQueryBatch(batchId, root);
    // A previous process may have performed paid inference. Never repeat it implicitly.
    batch.jobs.forEach((job) => {
      if (job.status === 'running') job.status = 'uncertain';
    });
  } else {
    const chosen = settings.queries.filter((query) =>
      options.ids ? options.ids.includes(query.id) : query.enabled,
    );
    if (options.ids?.some((id) => !chosen.some((query) => query.id === id)))
      throw new Error('unknown_query_id');
    batch = {
      id: batchId,
      createdAt: new Date().toISOString(),
      jobs: chosen.map((query) => ({
        id: query.id,
        query: query.query,
        context: query.context,
        concepts: query.concepts,
        supplementalSites: [
          ...new Set([...(settings.supplementalSites ?? []), ...(query.supplementalSites ?? [])]),
        ],
        status: 'pending',
        saved: [],
        gaps: [],
      })),
    };
    // Reject the whole malformed plan before spending inference or writing a receipt.
    batch.jobs.forEach((job) =>
      parseRequest({
        query: job.query,
        context: job.context,
        supplementalSites: job.supplementalSites,
      }),
    );
  }
  await atomicJson(path, batch);
  options.progress?.(
    `Batch ${batchId}: ${batch.jobs.length} interests, sequential ${settings.profile} runs; ${JSON.stringify(budgets[settings.profile])} per query, threshold ${settings.threshold}, ${settings.destination}, local saves only.`,
  );
  let processed = 0;
  for (const job of batch.jobs) {
    if (options.signal?.aborted) break;
    if (job.status !== 'pending') continue;
    if (processed++ >= limit) break;
    // Persist the uncertainty boundary before invoking AI. Do not hold the corpus writer during research.
    await withWriter(root, async () => {
      const current = await loadQueryBatch(batch.id, root);
      const stored = current.jobs.find((item) => item.id === job.id)!;
      if (stored.status !== 'pending') throw new Error('batch_job_already_claimed');
      stored.status = 'running';
      await atomicJson(path, current);
    });
    job.status = 'running';
    options.progress?.(`Research ${job.id}: ${job.query}`);
    try {
      const result = await (options.search ?? signalSearch)(
        {
          query: job.query,
          context: job.context,
          profile: settings.profile,
          threshold: settings.threshold,
          sources: settings.sources,
          supplementalSites: job.supplementalSites,
          save: 'never',
          cache: 'private',
        },
        {
          root,
          runner: codexRunner(settings.model || undefined, settings.effort || undefined, {
            extractionModel: settings.extractionModel || undefined,
            extractionEffort: settings.extractionEffort || undefined,
          }),
          signal: options.signal,
          progress: options.progress,
        },
      );
      job.runId = result.runId;
      job.gaps = result.gaps;
      job.status = result.status === 'not_configured' ? 'failed' : result.status;
      await retainRun(result, root);
      if (['completed', 'partial'].includes(result.status) && !options.signal?.aborted) {
        const saved = await saveEntities(
          result.items,
          'eligible',
          root,
          settings.destination,
          settings.threshold,
          false,
          {
            runId: result.runId,
            query: result.query,
            kind: 'query-discovery',
            queryId: job.id,
            concepts: job.concepts,
          },
        );
        job.saved = saved.changed;
      }
    } catch (failure) {
      job.status = options.signal?.aborted ? 'cancelled' : 'failed';
      job.gaps.push(failure instanceof Error ? failure.message : 'query_batch_failed');
    }
    await atomicJson(path, batch);
    options.progress?.(`${job.id}: ${job.status}; ${job.saved.length} canonical files changed.`);
  }
  return batch;
}
