import { parseArgs } from 'node:util';
import { acceptDiscovery, signalSearch } from '../packages/corpus/src/signal-search.js';
import { proposalSchema, parseRequest, budgets } from '../packages/domain/src/search-contract.js';
import { codexRunner } from '../packages/corpus/src/search-runner.js';
import { execFileSync } from 'node:child_process';
import { searchEvidenceBundle } from '../packages/corpus/src/search-exchange.js';
import { retainRun, saveEntities } from '../packages/corpus/src/search-store.js';
import { randomUUID } from 'node:crypto';
import { directSearch } from '../packages/corpus/src/search-direct.js';
import type { SearchResult } from '../packages/domain/src/search-contract.js';

const { values } = parseArgs({
  options: {
    query: { type: 'string' },
    profile: { type: 'string' },
    save: { type: 'string' },
    cache: { type: 'string' },
    site: { type: 'string', multiple: true },
    threshold: { type: 'string' },
    model: { type: 'string' },
    effort: { type: 'string' },
    'extract-model': { type: 'string' },
    'extract-effort': { type: 'string' },
    json: { type: 'boolean' },
    schema: { type: 'boolean' },
    capability: { type: 'boolean' },
    'sources-only': { type: 'boolean' },
    accept: { type: 'boolean' },
    context: { type: 'boolean' },
  },
});
try {
  if (values.schema) process.stdout.write(`${JSON.stringify(proposalSchema)}\n`);
  else if (values.capability)
    process.stdout.write(
      `${JSON.stringify({ ...(await codexRunner().readiness()), limits: budgets, persistence: 'none unless selected', unattended: false })}\n`,
    );
  else {
    const request = parseRequest({
      query: values.query,
      profile: values.profile ?? 'wide',
      save: values.save ?? 'never',
      cache: values.cache ?? 'memory',
      supplementalSites: values.site,
      threshold: Number(values.threshold ?? 75),
    });
    const controller = new AbortController();
    if (values['sources-only']) {
      process.stdout.write(
        `${JSON.stringify(await directSearch(request, controller.signal), null, 2)}\n`,
      );
      process.exit(0);
    }
    process.once('SIGINT', () => controller.abort());
    process.once('SIGTERM', () => controller.abort());
    let input = '';
    if (values.accept)
      for await (const chunk of process.stdin) {
        input += String(chunk);
        if (input.length > 2000000) throw new Error('proposal_bytes_limit');
      }
    const started = Date.now();
    const result: SearchResult = values.accept
      ? {
          schemaVersion: 2,
          runId: randomUUID(),
          query: request.query,
          status: 'completed',
          ...(await acceptDiscovery(JSON.parse(input), request, { signal: controller.signal })),
          usage: {
            searches: 0,
            documents: 0,
            elapsedMs: 0,
            modelCalls: 0,
            providerUsage: { nativeHost: 'not instrumented by helper' },
            cost: null,
          },
          limits: budgets[request.profile ?? 'wide'],
        }
      : await signalSearch(request, {
          runner: codexRunner(values.model, values.effort, {
            extractionModel: values['extract-model'],
            extractionEffort: values['extract-effort'],
          }),
          signal: controller.signal,
          progress: (event) => process.stderr.write(`${event}\n`),
        });
    if (values.accept) {
      result.usage.documents = result.sources.filter((source) => source.state === 'fetched').length;
      // Native acquisition is owned by the caller; family counts can overlap.
      // This helper performs no search tool calls and cannot infer the host's usage.
      result.usage.elapsedMs = Date.now() - started;
      if (result.sources.some((source) => source.state !== 'fetched')) result.status = 'partial';
      if (controller.signal.aborted) result.status = 'cancelled';
    }
    if (values.accept && request.save === 'eligible' && result.status !== 'cancelled') {
      const saved = await saveEntities(
        result.items,
        'eligible',
        process.cwd(),
        'public',
        request.threshold ?? 75,
        false,
        { runId: result.runId, query: result.query, kind: 'one-off' },
      );
      result.persistence = { changed: saved.changed, skipped: saved.skipped, privateRun: false };
    }
    if (values.accept && request.cache === 'private') {
      result.persistence = { changed: [], skipped: [], ...result.persistence, privateRun: true };
      await retainRun(result);
    }
    const output =
      values.context && 'runId' in result
        ? searchEvidenceBundle(
            result,
            execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
          )
        : result;
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    if ('status' in result && ['failed', 'not_configured'].includes(result.status))
      process.exitCode = 1;
  }
} catch (failure) {
  process.stdout.write(
    `${JSON.stringify({ status: 'failed', code: failure instanceof Error ? failure.message : 'search_failed' })}\n`,
  );
  process.exitCode = 1;
}
