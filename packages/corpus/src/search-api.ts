import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Type } from 'typebox';
import { Value } from 'typebox/value';
import { parseRequest, type SearchResult } from '../../domain/src/search-contract.js';
import { signalSearch } from './signal-search.js';
import { codexRunner } from './search-runner.js';
import { loadSettings, saveSettings } from './search-settings.js';
import {
  loadEntities,
  saveEntities,
  retainRun,
  atomicJson,
  cleanRuns,
  loadRun,
  runHistory,
  selectionHistory,
} from './search-store.js';
import { runDueOnce, refreshRequest } from './search-scheduler.js';
import { answerFromEvidence } from './search-followup.js';
import {
  runQueryListOnce,
  queryBatchHistory,
  loadQueryBatch,
  type QueryBatch,
} from './search-query-list.js';

const selection = Type.Object(
  {
    runId: Type.String({ format: 'uuid' }),
    ids: Type.Array(Type.String({ pattern: '^entity-[a-f0-9]{24}$' }), {
      maxItems: 60,
      uniqueItems: true,
    }),
    mode: Type.Enum(['manual', 'eligible']),
  },
  { additionalProperties: false },
);
const idsSchema = Type.Object(
  { ids: selection.properties.ids, dismissed: Type.Boolean() },
  { additionalProperties: false },
);
const followupSchema = Type.Object(
  {
    runId: selection.properties.runId,
    ids: selection.properties.ids,
    question: Type.String({ minLength: 1, maxLength: 2000 }),
  },
  { additionalProperties: false },
);
interface ActiveRun {
  controller: AbortController;
  events: string[];
  result?: SearchResult;
  error?: string;
  batch?: QueryBatch;
}
export function searchApi(root = process.cwd(), search = signalSearch) {
  const token = randomBytes(32).toString('hex');
  const runs = new Map<string, ActiveRun>();
  const pruneRuns = () => {
    for (const [key, run] of runs) {
      if (runs.size <= 30) break;
      if (run.result || run.error || run.batch) runs.delete(key);
    }
  };
  let active = false;
  return async (request: IncomingMessage, response: ServerResponse): Promise<boolean> => {
    const path = request.url?.split('?')[0] ?? '';
    if (!path.startsWith('/signals-ai/__signals/api/')) return false;
    const json = (status: number, value: unknown) => {
      response.writeHead(status, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      });
      response.end(JSON.stringify(value));
    };
    const host = request.headers.host ?? '';
    if (
      !/^127\.0\.0\.1:\d{2,5}$/.test(host) ||
      (request.headers.origin && request.headers.origin !== `http://${host}`) ||
      request.headers['sec-fetch-site'] === 'cross-site'
    ) {
      json(403, { code: 'untrusted_origin' });
      return true;
    }
    const mutation = request.method === 'POST';
    if (mutation && request.headers['x-signals-token'] !== token) {
      json(403, { code: 'csrf_token_required' });
      return true;
    }
    if (!['GET', 'POST'].includes(request.method ?? '')) {
      json(405, { code: 'method_not_allowed' });
      return true;
    }
    try {
      let body: unknown;
      if (mutation) {
        if (!request.headers['content-type']?.startsWith('application/json'))
          throw new Error('json_required');
        let raw = '';
        for await (const chunk of request) {
          raw += String(chunk);
          if (Buffer.byteLength(raw) > 128000) throw new Error('request_too_large');
        }
        body = JSON.parse(raw);
      }
      const route = path.slice('/signals-ai/__signals/api/'.length);
      if (route === 'session' && !mutation)
        json(200, {
          token,
          capability: await codexRunner().readiness(),
          active,
          limits: 'One AI job; quick 8 searches/20 documents/240s; wide 24/60/600s.',
        });
      else if (route === 'settings')
        json(200, mutation ? await saveSettings(body, root) : await loadSettings(root));
      else if (route === 'corpus' && !mutation)
        json(200, await loadEntities(resolve(root, 'signals/entities')));
      else if (route === 'private-corpus' && !mutation)
        json(200, await loadEntities(resolve(root, '.signals/corpus/entities')));
      else if (route === 'history' && !mutation)
        json(200, {
          runs: await runHistory(root),
          batches: await queryBatchHistory(root),
          selections: (await selectionHistory(root)).slice(-30).reverse(),
          discovery: JSON.parse(
            await readFile(resolve(root, '.signals/discovery-state.json'), 'utf8').catch(
              () => '{}',
            ),
          ) as unknown,
        });
      else if (route === 'history/open' && mutation) {
        if (
          !Value.Check(
            Type.Object({ runId: selection.properties.runId }, { additionalProperties: false }),
            body,
          )
        )
          throw new Error('invalid_history_selection');
        const result = await loadRun(body.runId, root, (await loadSettings(root)).threshold);
        const id = randomBytes(16).toString('hex');
        runs.set(id, {
          controller: new AbortController(),
          events: ['Reopened frozen result; no inference or new acquisition.'],
          result,
        });
        pruneRuns();
        json(200, { id });
      } else if ((route === 'search' || route === 'refresh') && mutation) {
        if (active) {
          json(409, { code: 'runner_busy' });
          return true;
        }
        const settings = await loadSettings(root);
        let input = body;
        let refreshDestination = settings.destination;
        let refreshId: string | undefined;
        if (route === 'refresh') {
          if (
            !body ||
            typeof body !== 'object' ||
            Object.keys(body).join(',') !== 'id' ||
            !('id' in body) ||
            typeof body.id !== 'string'
          )
            throw new Error('invalid_refresh');
          let record = (
            await loadEntities(
              resolve(
                root,
                settings.destination === 'public' ? 'signals/entities' : '.signals/corpus/entities',
              ),
            )
          ).find((item) => item.entity.id === (body as { id: string }).id);
          if (!record) {
            refreshDestination = settings.destination === 'public' ? 'private' : 'public';
            record = (
              await loadEntities(
                resolve(
                  root,
                  refreshDestination === 'public' ? 'signals/entities' : '.signals/corpus/entities',
                ),
              )
            ).find((item) => item.entity.id === (body as { id: string }).id);
          }
          if (!record) throw new Error('unknown_entity');
          refreshId = record.entity.id;
          input = refreshRequest(record.entity, settings);
        }
        const rawQuery = parseRequest(input);
        const query = parseRequest({
          ...rawQuery,
          supplementalSites: [
            ...new Set([
              ...(settings.supplementalSites ?? []),
              ...(rawQuery.supplementalSites ?? []),
            ]),
          ],
        });
        if (query.save === 'eligible') throw new Error('interactive_review_first');
        const controller = new AbortController(),
          id = randomBytes(16).toString('hex');
        const run: ActiveRun = { controller, events: ['Starting research…'] };
        runs.set(id, run);
        active = true;
        void search(
          {
            ...query,
            profile: query.profile ?? settings.profile,
            threshold: query.threshold ?? settings.threshold,
            sources: settings.sources,
            supplementalSites: [
              ...new Set([
                ...(settings.supplementalSites ?? []),
                ...(query.supplementalSites ?? []),
              ]),
            ],
            save: 'never',
          },
          {
            root,
            runner: codexRunner(settings.model || undefined, settings.effort || undefined, {
              extractionModel: settings.extractionModel || undefined,
              extractionEffort: settings.extractionEffort || undefined,
            }),
            signal: controller.signal,
            progress: (event) => {
              run.events.push(event);
              if (run.events.length > 100) run.events.shift();
            },
          },
        )
          .then(async (result) => {
            try {
              if (query.cache === 'private') await retainRun(result, root);
              if (
                route === 'refresh' &&
                !['failed', 'not_configured', 'cancelled'].includes(result.status)
              ) {
                const target = result.items.filter((item) => item.entity.id === refreshId);
                if (!target.length) throw new Error('refresh_target_missing');
                const saved = await saveEntities(
                  target,
                  'refresh',
                  root,
                  refreshDestination,
                  settings.threshold,
                  false,
                  { runId: result.runId, query: result.query, kind: 'corpus-refresh' },
                );
                if (saved.skipped.length) throw new Error('refresh_target_not_updated');
              }
            } catch (failure) {
              result.gaps.push(
                `Local persistence failed: ${failure instanceof Error ? failure.message : 'unknown'}`,
              );
              result.status = 'partial';
            }
            run.result = result;
          })
          .catch((failure: unknown) => {
            run.error = failure instanceof Error ? failure.message : 'search_failed';
            run.events.push(run.error);
          })
          .finally(() => {
            active = false;
            pruneRuns();
          });
        json(202, { id });
      } else if (/^runs\/[a-f0-9]{32}$/.test(route) && !mutation) {
        const run = runs.get(route.split('/')[1]!);
        json(
          run ? 200 : 404,
          run
            ? {
                events: run.events,
                result: run.result ?? null,
                error: run.error ?? null,
                batch: run.batch ?? null,
              }
            : { code: 'unknown_run' },
        );
      } else if (/^cancel\/[a-f0-9]{32}$/.test(route) && mutation) {
        const run = runs.get(route.split('/')[1]!);
        run?.controller.abort();
        json(200, { cancelled: !!run });
      } else if (route === 'save' && mutation) {
        if (!Value.Check(selection, body)) throw new Error('invalid_selection');
        const selected = body;
        const result = [...runs.values()].find(
          (run) => run.result?.runId === selected.runId,
        )?.result;
        if (
          !result ||
          selected.ids.some((id) => !result.items.some((item) => item.entity.id === id))
        )
          throw new Error('unknown_result_identity');
        const settings = await loadSettings(root);
        const interests = settings.queries.filter((query) => query.query === result.query);
        json(
          200,
          await saveEntities(
            result.items.filter((item) => selected.ids.includes(item.entity.id)),
            selected.mode,
            root,
            settings.destination,
            settings.threshold,
            false,
            {
              runId: result.runId,
              query: result.query,
              kind: 'one-off',
              ...(interests.length === 1
                ? { queryId: interests[0]!.id, concepts: interests[0]!.concepts }
                : {}),
            },
          ),
        );
      } else if (route === 'dismiss' && mutation) {
        if (!Value.Check(idsSchema, body)) throw new Error('invalid_dismissal');
        const selected = body;
        const path = resolve(root, '.signals/dismissed.json');
        const existing = JSON.parse(await readFile(path, 'utf8').catch(() => '[]')) as string[];
        const ids = selected.dismissed
          ? [...new Set([...existing, ...selected.ids])]
          : existing.filter((id) => !selected.ids.includes(id));
        await atomicJson(path, ids);
        json(200, { ids });
      } else if (route === 'followup' && mutation) {
        if (!Value.Check(followupSchema, body)) throw new Error('invalid_followup');
        const question = body;
        const result = [...runs.values()].find(
          (run) => run.result?.runId === question.runId,
        )?.result;
        if (
          !result ||
          question.ids.some((id) => !result.items.some((item) => item.entity.id === id))
        )
          throw new Error('unknown_result_identity');
        if (active) {
          json(409, { code: 'runner_busy' });
          return true;
        }
        const settings = await loadSettings(root);
        active = true;
        try {
          json(
            200,
            await answerFromEvidence(
              result,
              question.question,
              question.ids,
              settings.model || undefined,
              settings.effort || undefined,
            ),
          );
        } finally {
          active = false;
        }
      } else if (/^batches\/[a-f0-9-]{36}$/.test(route) && !mutation) {
        json(200, await loadQueryBatch(route.split('/')[1]!, root));
      } else if (route === 'run-list' && mutation) {
        const schema = Type.Object(
          {
            ids: Type.Optional(
              Type.Array(Type.String({ pattern: '^[a-z0-9-]{1,80}$' }), { maxItems: 512 }),
            ),
            resume: Type.Optional(Type.String({ format: 'uuid' })),
          },
          { additionalProperties: false },
        );
        if (!Value.Check(schema, body)) throw new Error('invalid_query_list');
        if (active) {
          json(409, { code: 'runner_busy' });
          return true;
        }
        const controller = new AbortController(),
          id = randomBytes(16).toString('hex');
        const run: ActiveRun = { controller, events: ['Starting explicit query-list research…'] };
        runs.set(id, run);
        active = true;
        void runQueryListOnce({
          root,
          search,
          ids: body.ids,
          resume: body.resume,
          signal: controller.signal,
          progress: (event) => {
            run.events.push(event);
            if (run.events.length > 100) run.events.shift();
          },
        })
          .then((batch) => {
            run.batch = batch;
          })
          .catch((failure) => {
            run.error = failure instanceof Error ? failure.message : 'query_list_failed';
          })
          .finally(() => {
            active = false;
            pruneRuns();
          });
        json(202, { id });
      } else if (route === 'run-due' && mutation) {
        if (active) {
          json(409, { code: 'runner_busy' });
          return true;
        }
        active = true;
        try {
          json(200, await runDueOnce({ root, search }));
        } finally {
          active = false;
        }
      } else if (route === 'cleanup' && mutation) {
        const settings = await loadSettings(root);
        await cleanRuns(root, settings.retentionDays);
        json(200, { cleaned: true, retainedHistory: 'preserved' });
      } else json(404, { code: 'unknown_operation' });
    } catch (failure) {
      json(400, { code: failure instanceof Error ? failure.message : 'invalid_request' });
    }
    return true;
  };
}
