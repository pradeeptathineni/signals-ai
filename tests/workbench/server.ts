import { createServer } from 'vite';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { searchApi } from '../../packages/corpus/src/search-api.js';
import { loadEntities } from '../../packages/corpus/src/search-store.js';
import { contextualize } from '../../packages/domain/src/search-priority.js';
import { saveDecision } from '../../packages/domain/src/search-score.js';
import {
  budgets,
  parseRequest,
  type SearchResult,
} from '../../packages/domain/src/search-contract.js';

// Replay approved public evidence through the real API/storage. No private planning records,
// browser route interception, discovery or model execution is part of this UI fixture.
const root = await realpath(await mkdtemp(join(tmpdir(), 'signals-workbench-')));
const approved = (await loadEntities(resolve('signals/entities'))).slice(0, 2);
if (approved.length !== 2) throw new Error('public_replay_fixture_missing');
const api = searchApi(root, async (input, dependencies) => {
  const request = parseRequest(input);
  dependencies?.progress?.('Replaying approved public evidence for UI verification.');
  if (request.query === 'cancellation fixture') {
    dependencies?.brief?.({
      format: 'markdown',
      text: 'This original answer is ready before source checks finish.',
    });
    dependencies?.provisional?.(
      approved.map(({ entity }) => ({
        uri: entity.uri,
        name: entity.name,
        description: entity.description,
        limits: entity.limits,
      })),
    );
    await new Promise<void>((done) =>
      dependencies?.signal?.addEventListener('abort', () => done(), { once: true }),
    );
  }
  const items = approved.map(({ entity }) => {
    const match = {
      level: 'direct' as const,
      reason: 'Developer UI replay; relevance is not evaluated.',
      sources: [0],
    };
    const decision = saveDecision(entity, match);
    return {
      entity: structuredClone(entity),
      match,
      ...decision,
      priority: {
        policy: 'contextual-priority-v1' as const,
        score: null,
        novelty: 'unknown' as const,
        personalNovelty: 'unknown' as const,
        feedback: 'none' as const,
        applicability: 'direct' as const,
        value: 'medium' as const,
        action: 'study' as const,
        reason: 'Inspect this approved evidence.',
        constraints: [],
        sources: [0],
        evidenceIds: entity.evidence.map((source) => source.id),
        relations: [
          {
            uri: approved[1]!.entity.uri,
            kind: 'alternative' as const,
            reason: 'Another approved record.',
          },
        ],
      },
    };
  });
  const result: SearchResult = {
    schemaVersion: 2,
    runId: randomUUID(),
    query: request.query,
    brief: {
      format: 'markdown',
      text: '## A practical next step\n\nInspect the retained public examples and compare their uses before choosing what to study.\n\n- [Inspect a public source](https://example.com/reference)\n- No new discovery was performed in this browser replay.',
    },
    status: dependencies?.signal?.aborted ? 'cancelled' : 'partial',
    items: contextualize(items, new Set()),
    sources: approved.flatMap(({ entity }) => entity.evidence),
    coverage: [],
    gaps: ['Developer replay: no new discovery performed.'],
    usage: {
      searches: 0,
      documents: 0,
      modelCalls: 0,
      elapsedMs: 0,
      providerUsage: null,
      cost: null,
    },
    counts: { leads: 2, distinct: 2, duplicates: 0, omitted: 0 },
    limits: budgets.quick,
  };
  if (request.query === 'partial metadata fixture') {
    result.items = [];
    result.brief = {
      format: 'markdown',
      text: 'The original answer is retained despite a record gap.\n\n<script>window.__briefExecuted = true</script>\n\n[Unsafe action](javascript:alert(1))',
    };
    result.provisionalLeads = [
      {
        name: 'Incomplete lead',
        uri: 'https://example.com/lead',
        description: 'A learning possibility awaiting source metadata.',
        limits: ['Missing supported defining evidence.'],
      },
    ];
  }
  return result;
});
const server = await createServer({
  configFile: resolve('apps/corpus/vite.config.ts'),
  server: { port: 5189, strictPort: true },
  plugins: [
    {
      name: 'server-owned-replay',
      enforce: 'pre',
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          void api(request, response)
            .then((handled) => {
              if (!handled) next();
            })
            .catch(next);
        });
      },
    },
  ],
});
await server.listen();
process.once('SIGTERM', () => {
  void server.close().then(() => rm(root, { recursive: true, force: true }));
});
