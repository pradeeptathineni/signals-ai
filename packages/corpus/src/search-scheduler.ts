import { readFile, writeFile, unlink, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  budgets,
  type SearchResult,
  type SearchRequest,
} from '../../domain/src/search-contract.js';
import { loadSettings, type SearchSettings } from './search-settings.js';
import {
  atomicJson,
  secureDirectory,
  loadEntities,
  retainRun,
  saveEntities,
  cleanRuns,
} from './search-store.js';
import { signalSearch } from './signal-search.js';
import { codexRunner } from './search-runner.js';
import { digest } from './search-fetch.js';
import { publicationReadiness, publishCorpus } from './search-publish.js';

interface JobState {
  slot: number;
  status: 'running' | 'completed' | 'uncertain' | 'failed';
  runId?: string;
  started: string;
  reason?: string;
}
type ScheduleState = Record<string, JobState>;
export function dueSlot(now: number, days: number, offsetMinutes = 0) {
  const interval = days * 86400000,
    offset = offsetMinutes * 60000;
  return Math.floor((now - offset) / interval) * interval + offset;
}
export function refreshRequest(
  entity: { uri: string; name: string; aliases: string[] },
  settings: SearchSettings,
): SearchRequest {
  return {
    query: `Refresh exact entity ${entity.name} (${entity.uri}); aliases ${entity.aliases.join(', ')}. Find material changes, new independent applied use, alternatives, deprecation and contrary evidence. Preserve exact canonical identity.`,
    profile: settings.profile,
    threshold: settings.threshold,
    cache: 'private',
    sources: settings.sources,
    supplementalSites: settings.supplementalSites,
    save: 'never',
  };
}
/** One lease protects AI work; completion follows idempotent entity writes, never inference alone. */
export async function runDueOnce(
  options: {
    root?: string;
    now?: number;
    settings?: SearchSettings;
    search?: typeof signalSearch;
    signal?: AbortSignal;
    progress?: (event: string) => void;
  } = {},
) {
  const root = options.root ?? process.cwd(),
    now = options.now ?? Date.now();
  const settings = options.settings ?? (await loadSettings(root));
  if (!settings.queryDiscovery && !settings.corpusDiscovery) return { enabled: false, jobs: [] };
  if (settings.publication === 'unattended') await publicationReadiness(root, true);
  const directory = resolve(root, '.signals');
  await secureDirectory(directory);
  const lease = resolve(directory, 'discovery-lease.json');
  try {
    await writeFile(
      lease,
      JSON.stringify({
        pid: process.pid,
        expires: now + budgets[settings.profile].seconds * 1000 + 60000,
      }),
      { flag: 'wx', mode: 0o600 },
    );
  } catch (failure) {
    if ((failure as NodeJS.ErrnoException).code !== 'EEXIST') throw failure;
    const owner = JSON.parse(await readFile(lease, 'utf8')) as { pid: number; expires: number };
    let alive = true;
    try {
      process.kill(owner.pid, 0);
    } catch {
      alive = false;
    }
    if (alive) return { enabled: true, busy: true, jobs: [] };
    const recovery = `${lease}.recovery`;
    try {
      await mkdir(recovery);
    } catch {
      return { enabled: true, busy: true, jobs: [] };
    }
    try {
      const current = JSON.parse(await readFile(lease, 'utf8')) as { pid: number; expires: number };
      if (current.pid !== owner.pid || current.expires !== owner.expires)
        return { enabled: true, busy: true, jobs: [] };
      await unlink(lease);
      return await runDueOnce(options);
    } finally {
      await rm(recovery, { recursive: true, force: true });
    }
  }
  try {
    const statePath = resolve(directory, 'discovery-state.json');
    const state = JSON.parse(await readFile(statePath, 'utf8').catch(() => '{}')) as ScheduleState;
    const jobs: { key: string; status: string; runId?: string; reason?: string }[] = [];
    const researchConfig = {
      runner: settings.runner,
      model: settings.model,
      effort: settings.effort,
      extractionModel: settings.extractionModel,
      extractionEffort: settings.extractionEffort,
      profile: settings.profile,
      threshold: settings.threshold,
      sources: settings.sources,
      supplementalSites: settings.supplementalSites,
      destination: settings.destination,
    };
    const revision = digest(
      JSON.stringify({ ...researchConfig, everyDays: settings.corpusEveryDays }),
    ).slice(0, 16);
    const planned: {
      identity: string;
      slot: number;
      request: SearchRequest;
      kind: 'query' | 'corpus';
      revision: string;
    }[] = [];
    if (settings.queryDiscovery)
      for (const query of settings.queries.filter((item) => item.enabled))
        planned.push({
          identity: query.id,
          slot: dueSlot(now, query.everyDays, query.offsetMinutes),
          request: {
            query: query.query,
            context: query.context,
            profile: settings.profile,
            threshold: settings.threshold,
            sources: settings.sources,
            supplementalSites: [
              ...new Set([
                ...(settings.supplementalSites ?? []),
                ...(query.supplementalSites ?? []),
              ]),
            ],
            save: 'never',
            cache: 'private',
          },
          kind: 'query',
          revision: digest(
            JSON.stringify({
              ...researchConfig,
              query: query.query,
              context: query.context,
              supplementalSites: [
                ...new Set([
                  ...(settings.supplementalSites ?? []),
                  ...(query.supplementalSites ?? []),
                ]),
              ],
              everyDays: query.everyDays,
              offsetMinutes: query.offsetMinutes,
            }),
          ).slice(0, 16),
        });
    if (settings.corpusDiscovery) {
      const corpus = await loadEntities(
        resolve(
          root,
          settings.destination === 'public' ? 'signals/entities' : '.signals/corpus/entities',
        ),
      );
      const slot = dueSlot(now, settings.corpusEveryDays);
      for (const record of corpus.sort(
        (a, b) =>
          (state[`corpus:${a.entity.id}:${revision}`]?.slot ?? 0) -
            (state[`corpus:${b.entity.id}:${revision}`]?.slot ?? 0) ||
          a.entity.id.localeCompare(b.entity.id),
      ))
        planned.push({
          identity: record.entity.id,
          slot,
          request: refreshRequest(record.entity, settings),
          kind: 'corpus',
          revision,
        });
    }
    const started = Date.now();
    for (const job of planned) {
      if (
        jobs.length >= settings.batchSize ||
        Date.now() - started >= 1200000 ||
        options.signal?.aborted
      )
        break;
      const key = `${job.kind}:${job.identity}:${job.revision}`;
      const prior = state[key];
      if (prior && prior.slot >= job.slot) {
        if (prior.status === 'running') {
          prior.status = 'uncertain';
          prior.reason =
            'Interrupted after possible inference. Inspect the frozen run; explicit retry is required.';
          await atomicJson(statePath, state);
          jobs.push({ key, status: 'uncertain', reason: prior.reason });
        }
        continue;
      }
      state[key] = { slot: job.slot, status: 'running', started: new Date(now).toISOString() };
      await atomicJson(statePath, state);
      let result: SearchResult;
      try {
        result = await (options.search ?? signalSearch)(job.request, {
          root,
          runner: codexRunner(settings.model || undefined, settings.effort || undefined, {
            extractionModel: settings.extractionModel || undefined,
            extractionEffort: settings.extractionEffort || undefined,
          }),
          signal: options.signal,
          progress: options.progress,
        });
        await retainRun(result, root);
        if (
          result.status === 'failed' ||
          result.status === 'not_configured' ||
          result.status === 'cancelled'
        )
          throw new Error(result.gaps.join('; ') || result.status);
        const targets =
          job.kind === 'corpus'
            ? result.items.filter((item) => item.entity.id === job.identity)
            : result.items;
        if (job.kind === 'corpus' && !targets.length) throw new Error('refresh_target_missing');
        const saved = await saveEntities(
          targets,
          job.kind === 'corpus' ? 'refresh' : 'eligible',
          root,
          settings.destination,
          settings.threshold,
          false,
          {
            runId: result.runId,
            query: result.query,
            kind: job.kind === 'query' ? 'query-discovery' : 'corpus-refresh',
            ...(job.kind === 'query'
              ? {
                  queryId: job.identity,
                  concepts:
                    settings.queries.find((query) => query.id === job.identity)?.concepts ?? [],
                }
              : {}),
          },
        );
        if (job.kind === 'corpus' && saved.skipped.length)
          throw new Error('refresh_target_not_updated');
        state[key] = {
          slot: job.slot,
          status: 'completed',
          started: new Date(now).toISOString(),
          runId: result.runId,
        };
      } catch (failure) {
        state[key] = {
          slot: job.slot,
          status: 'failed',
          started: new Date(now).toISOString(),
          reason: failure instanceof Error ? failure.message : 'job_failed',
        };
      }
      await atomicJson(statePath, state);
      jobs.push({ key, ...state[key] });
    }
    await cleanRuns(root, settings.retentionDays);
    const publication =
      settings.publication === 'unattended'
        ? await publishCorpus(root)
        : { published: false, reason: settings.publication };
    return { enabled: true, jobs, publication };
  } finally {
    await unlink(lease);
  }
}
