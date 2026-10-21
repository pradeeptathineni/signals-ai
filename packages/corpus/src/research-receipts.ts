import { readdir, lstat, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { SearchResult } from '../../domain/src/search-contract.js';
import { budgets } from '../../domain/src/search-contract.js';
import type { LibraryFinding } from '../../domain/src/library-search.js';
import { readPrivateJson, loadRun } from './search-store.js';
import { planResearchRetention, type ResearchAnswer } from './research-answer.js';

async function entries(root: string, store: 'queries' | 'runs') {
  const directory = resolve(root, '.signals', store);
  const stat = await lstat(directory).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (!stat) return [];
  if (!stat.isDirectory() || stat.isSymbolicLink() || (await realpath(directory)) !== directory)
    throw new Error('unsafe_answer_store');
  return (await readdir(directory)).filter((name) => /^[a-f0-9-]{36}\.json$/.test(name));
}

/** Read legacy answer imports in place; no migration, rewriting or evidence promotion. */
export async function importedAnswers(root: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  for (const name of await entries(root, 'queries')) {
    const record = (await readPrivateJson(root, `queries/${name}`, null)) as {
      recordVersion?: number;
      savedAt?: string;
      result?: { input?: ResearchAnswer; answerSha256?: string; runId?: string };
    } | null;
    if (!record?.result?.input?.answer) continue; // Other query record formats keep their owners.
    const { input, runId } = record.result;
    if (
      record.recordVersion !== 1 ||
      !runId ||
      !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(runId)
    )
      throw new Error('invalid_answer_receipt');
    const plan = planResearchRetention(input);
    if (record.result.answerSha256 !== plan.answerSha256) throw new Error('answer_digest_mismatch');
    results.push({
      schemaVersion: 2,
      runId,
      query: input.query,
      status: 'completed',
      brief: { format: 'markdown', text: input.answer },
      answerReceipt: {
        observedAt: input.observedAt,
        sha256: plan.answerSha256,
        state: 'unassessed',
        confidence: 'unknown',
        provenance: input.provenance,
      },
      provisionalLeads: plan.citations.slice(0, 60).map((citation) => ({
        uri: citation.uri,
        name: citation.label,
        description: citation.context,
        limits: plan.limits,
      })),
      items: [],
      sources: [],
      coverage: [],
      gaps: plan.limits,
      counts: {
        leads: plan.citations.length,
        distinct: 0,
        duplicates: 0,
        omitted: Math.max(0, plan.citations.length - 60),
      },
      usage: {
        searches: 0,
        documents: 0,
        modelCalls: 0,
        elapsedMs: 0,
        cost: null,
        providerUsage: null,
      },
      limits: budgets.wide,
    });
  }
  return results;
}

export async function loadAnswerLibrary(root: string): Promise<LibraryFinding[]> {
  const imported = await importedAnswers(root);
  const runs: SearchResult[] = [];
  for (const name of await entries(root, 'runs')) {
    const raw = (await readPrivateJson(root, `runs/${name}`, null)) as SearchResult | null;
    if (raw?.answerReceipt) runs.push(await loadRun(name.slice(0, -5), root));
  }
  const identities = new Map<string, SearchResult>();
  for (const run of [...imported, ...runs]) {
    if (identities.has(run.runId)) throw new Error('duplicate_answer_receipt');
    identities.set(run.runId, run);
  }
  return [...identities.values()].map((run) => {
    const usage = run.usage.providerUsage;
    const cleanup = usage && typeof usage === 'object' && 'cleanup' in usage && usage.cleanup;
    const confirmed =
      cleanup && typeof cleanup === 'object' && 'complete' in cleanup && cleanup.complete === true;
    const cleanupLimit = confirmed
      ? []
      : [
          'Execution cleanup is unconfirmed for this retained answer; its historical status and bytes are unchanged.',
        ];
    return {
      key: `answer:private:${run.runId}`,
      id: run.runId,
      title: run.query,
      uri: '#',
      description: `${run.status === 'completed' ? 'Retained research answer' : 'Incomplete retained research answer'}. Unassessed; confidence Unknown.${confirmed ? '' : ' Execution cleanup unconfirmed.'}`,
      kind: 'research-answer',
      aliases: [],
      domains: [],
      capabilities: [],
      useCases: [],
      technologies: [],
      tags: [],
      sourceNames: (run.provisionalLeads ?? []).slice(0, 40).map((lead) => lead.name),
      intrinsicStrength: { policy: 'unassessed-answer', score: null },
      license: { state: 'unknown', values: [], openSource: null },
      access: { state: 'unknown', freeToUse: null },
      origin: { format: 'answer', destination: 'private', recordId: run.runId },
      saved: true,
      observedAt: run.answerReceipt!.observedAt,
      answerText: run.brief!.text,
      answer: {
        runId: run.runId,
        sha256: run.answerReceipt!.sha256,
        provenance: run.answerReceipt!.provenance,
        limits: [...run.gaps, ...cleanupLimit],
      },
    };
  });
}
