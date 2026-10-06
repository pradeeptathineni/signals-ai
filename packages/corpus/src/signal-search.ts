import { randomUUID } from 'node:crypto';
import {
  budgets,
  channels,
  parseProposal,
  parseRequest,
  type SearchResult,
  type SearchRequest,
  type Source,
  type Entity,
  type Proposal,
} from '../../domain/src/search-contract.js';
import { normalizeConsiderUrl } from '../../domain/src/url.js';
import { assessEntity, filterSearchItems, saveDecision } from '../../domain/src/search-score.js';
import { digest, fetchEvidence, normalizeText, normalizeSpan } from './search-fetch.js';
import { codexRunner, RunnerFailure, type SearchRunner } from './search-runner.js';
import { privateCacheFetch } from './search-cache.js';
import { atomicJson, saveEntities, retainRun } from './search-store.js';
import { resolve } from 'node:path';

function entityUri(uri: string) {
  return `${normalizeConsiderUrl(uri).normalizedUrl}${new URL(uri).hash}`;
}
export function entityIdentity(uri: string) {
  const normalized = normalizeConsiderUrl(uri);
  const repository =
    normalized.hostname === 'github.com' &&
    !new URL(uri).hash &&
    new URL(normalized.normalizedUrl).pathname.split('/').filter(Boolean).length === 2;
  return `entity-${digest(repository && normalized.strongIdentity ? `github:${normalized.strongIdentity.value}` : entityUri(uri)).slice(0, 24)}`;
}
export function observationIdentity(
  entityId: string,
  evidenceId: string,
  observation: Omit<Proposal['candidates'][number]['observations'][number], 'source'>,
  basisEvidenceId = evidenceId,
  literal = false,
) {
  const quote = literal ? normalizeSpan(observation.quote) : normalizeText(observation.quote);
  const basisId = `basis-${digest(`${entityId}:${basisEvidenceId}:${observation.feature}:${quote.toLowerCase()}`).slice(0, 24)}`;
  return {
    basisId,
    id: `observation-${digest(`${basisId}:${observation.indicator}:${observation.status}:${observation.independent}:${observation.origin.trim().toLowerCase()}${basisEvidenceId === evidenceId ? '' : `:${evidenceId}`}`).slice(0, 24)}`,
  };
}

export async function acceptDiscovery(
  input: unknown,
  request: SearchRequest,
  dependencies: {
    signal?: AbortSignal;
    fetch?: typeof fetchEvidence;
    asOf?: string;
    evidenceClass?: Entity['acquisition'];
    progress?: (event: string) => void;
    enrich?: (
      proposal: Proposal,
      material: { index: number; uri: string; text: string }[],
    ) => Promise<Proposal>;
  } = {},
) {
  let proposal = parseProposal(input);
  let asOf = dependencies.asOf ?? new Date().toISOString();
  const limits = budgets[request.profile ?? 'wide'];
  if (
    proposal.coverage.some((item) => item.searches > limits.searches) ||
    proposal.sources.length > limits.documents ||
    proposal.candidates.length > limits.entities
  )
    throw new Error('budget_exhausted');
  const gaps = [...proposal.gaps];
  const sources: Source[] = [];
  const documents = new Map<string, Awaited<ReturnType<typeof fetchEvidence>>>();
  for (const source of proposal.sources) {
    let uri: string;
    try {
      uri = normalizeConsiderUrl(source.uri).normalizedUrl;
    } catch {
      uri = '';
    }
    const accepted: Source = {
      ...source,
      uri: uri || source.uri,
      id: `evidence-${digest(uri || source.uri).slice(0, 24)}`,
      fetchedAt: asOf,
      digest: null,
      state: 'failed',
      reason: '',
      excerpt: '',
    };
    try {
      if (!uri) throw new Error('source_url_denied');
      if (request.sources && !request.sources.includes(source.family))
        throw new Error('source_channel_disabled');
      if (
        source.publishedAt &&
        (!Number.isFinite(Date.parse(source.publishedAt)) ||
          Date.parse(source.publishedAt) > Date.parse(asOf))
      )
        throw new Error('invalid_source_date');
      dependencies.signal?.throwIfAborted();
      dependencies.progress?.(`Fetching ${new URL(uri).hostname}`);
      const fetched =
        documents.get(uri) ??
        (await (dependencies.fetch ?? fetchEvidence)(uri, dependencies.signal));
      documents.set(uri, fetched);
      accepted.state = 'fetched';
      accepted.digest = fetched.digest;
      if ('cached' in fetched && fetched.cached) accepted.reason = 'private-cache-hit';
      if ('fetchedAt' in fetched && typeof fetched.fetchedAt === 'string')
        accepted.fetchedAt = fetched.fetchedAt;
      accepted.id = `evidence-${digest(`${uri}:${fetched.digest}`).slice(0, 24)}`;
    } catch (failure) {
      accepted.reason = failure instanceof Error ? failure.message : 'source_failed';
      if (accepted.reason === 'invalid_source_date') accepted.publishedAt = null;
      if (/denied|blocked|forbidden/.test(accepted.reason)) accepted.state = 'denied';
      gaps.push(`${source.title}: ${accepted.reason}`);
    }
    sources.push(accepted);
  }
  if (dependencies.enrich && !dependencies.signal?.aborted) {
    const allowance = Math.floor(48000 / Math.max(1, documents.size));
    const material = sources.flatMap((source, index) => {
      const text = documents.get(source.uri)?.text;
      if (!text) return [];
      if (text.length <= allowance) return [{ index, uri: source.uri, text }];
      const mentions = proposal.candidates.filter(
        (candidate) =>
          candidate.match.sources.includes(index) ||
          candidate.observations.some((observation) => observation.source === index),
      );
      const locations = mentions
        .flatMap((candidate) => [
          ...candidate.observations
            .filter((observation) => observation.source === index)
            .map((observation) =>
              text.toLowerCase().indexOf(normalizeSpan(observation.quote).toLowerCase()),
            ),
          text.toLowerCase().lastIndexOf(candidate.name.toLowerCase()),
        ])
        .filter((location) => location >= 0);
      const excerpts = [
        ...[...new Set(locations)]
          .slice(0, 5)
          .map((location) => text.slice(Math.max(0, location - 100), location + 700)),
        text.slice(0, Math.min(2000, allowance)),
        text.slice(Math.floor(text.length / 2), Math.floor(text.length / 2) + 700),
        text.slice(-700),
      ]
        .join(' … ')
        .slice(0, allowance);
      return [{ index, uri: source.uri, text: excerpts }];
    });
    try {
      proposal = parseProposal(await dependencies.enrich(proposal, material));
      gaps.push(...proposal.gaps.filter((gap) => !gaps.includes(gap)));
    } catch (failure) {
      gaps.push(
        `Grounded extraction unavailable: ${failure instanceof Error ? failure.message : 'failed'}`,
      );
      proposal = {
        ...proposal,
        candidates: proposal.candidates.map((candidate) => ({ ...candidate, observations: [] })),
      };
    }
  }
  // An immutable evidence projection includes its selected spans. The same raw document
  if (!dependencies.asOf) asOf = new Date().toISOString();
  // can later support new spans without overwriting the earlier public evidence bytes.
  sources.forEach((source) => {
    if (source.state !== 'fetched') return;
    const text = documents.get(source.uri)?.text.toLowerCase() ?? '';
    const quotes = proposal.candidates
      .flatMap((candidate) =>
        candidate.observations
          .filter((observation) => sources[observation.source]?.uri === source.uri)
          .map((observation) => normalizeSpan(observation.quote)),
      )
      .filter((quote) => quote.length >= 8 && text.includes(quote.toLowerCase()));
    const excerpt = [...new Set(quotes)].sort().join(' … ');
    source.excerpt = excerpt.slice(0, 12000);
    if (excerpt.length > 12000) gaps.push(`${source.title}: verified excerpt budget exhausted`);
    source.excerptDigest = digest(source.excerpt);
    source.id = `evidence-${digest(`${source.uri}:${source.digest}:${source.excerptDigest}`).slice(0, 24)}`;
  });
  const entities = new Map<
    string,
    { entity: Entity; match: Proposal['candidates'][number]['match'] }
  >();
  let duplicates = 0,
    omitted = 0;
  const safeEvidence = new Set(
    sources.flatMap((source) => {
      try {
        normalizeConsiderUrl(source.uri);
        return [source.id];
      } catch {
        return [];
      }
    }),
  );
  for (const candidate of proposal.candidates) {
    let uri: string;
    try {
      uri = entityUri(candidate.uri);
    } catch {
      gaps.push(`Invalid identity: ${candidate.name}`);
      omitted++;
      continue;
    }
    const id = entityIdentity(uri);
    const observations = candidate.observations
      .filter((observation) => safeEvidence.has(sources[observation.source]!.id))
      .map((observation) => {
        const { source: index, ...fields } = observation;
        const source = sources[index]!;
        const quote = normalizeSpan(observation.quote);
        const text = documents.get(source.uri)?.text ?? '';
        const verified =
          source.state === 'fetched' &&
          quote.length >= 8 &&
          text.toLowerCase().includes(quote.toLowerCase()) &&
          source.excerpt.toLowerCase().includes(quote.toLowerCase());
        return {
          ...fields,
          ...observationIdentity(
            id,
            source.id,
            observation,
            source.excerptDigest
              ? `evidence-${digest(`${source.uri}:${source.digest}`).slice(0, 24)}`
              : source.id,
            true,
          ),
          supersedes: [],
          derivation: 'model-assessment' as const,
          evidenceId: source.id,
          verified,
        };
      });
    const evidenceIds = new Set(observations.map((item) => item.evidenceId));
    const evidence = [
      ...new Map(
        sources.filter((source) => evidenceIds.has(source.id)).map((source) => [source.id, source]),
      ).values(),
    ];
    const currentEvidence = [
      ...new Map(
        evidence
          .filter((source) => source.state === 'fetched')
          .map((source) => [source.uri, source.id]),
      ).values(),
    ].sort();
    const currentChecks = Object.fromEntries(
      evidence
        .filter((source) => source.state === 'fetched')
        .map((source) => [source.uri, source.fetchedAt]),
    );
    const entity: Entity = {
      ...candidate,
      uri,
      id,
      acquisition: dependencies.evidenceClass ?? (dependencies.fetch ? 'fixture' : 'native-agent'),
      observations,
      evidence,
      currentEvidence,
      currentChecks,
      assessment: assessEntity(
        {
          observations,
          evidence,
          currentEvidence,
          currentChecks,
          kind: candidate.kind,
          identity: candidate.identity,
          uri,
        },
        asOf,
      ),
    };
    // Query-dependent fields never enter the reusable entity.
    const canonical = Object.fromEntries(
      Object.entries(entity).filter(([key]) => key !== 'match'),
    ) as unknown as Entity;
    if (entities.has(id)) {
      duplicates++;
      gaps.push(`Duplicate candidate merged: ${candidate.name}`);
      const prior = entities.get(id)!;
      const name = (value: string) => value.trim().toLowerCase();
      const sameName =
        name(prior.entity.name) === name(candidate.name) ||
        candidate.aliases.some((alias) => name(alias) === name(prior.entity.name)) ||
        prior.entity.aliases.some((alias) => name(alias) === name(candidate.name));
      if (prior.entity.kind !== candidate.kind || !sameName) {
        prior.entity.identity = 'ambiguous';
        prior.entity.limits.push(
          `Unresolved lead sharing this URI: ${candidate.name} (${candidate.kind}). Resolve separate resource identities before saving.`,
        );
      }
      prior.entity.observations = [
        ...new Map(
          [...prior.entity.observations, ...observations].map((item) => [item.id, item]),
        ).values(),
      ];
      prior.entity.evidence = [
        ...new Map(
          [...prior.entity.evidence, ...entity.evidence].map((item) => [item.id, item]),
        ).values(),
      ];
      prior.entity.currentEvidence = [
        ...new Set([...(prior.entity.currentEvidence ?? []), ...(entity.currentEvidence ?? [])]),
      ].sort();
      prior.entity.assessment = assessEntity(prior.entity, asOf);
    } else entities.set(id, { entity: canonical, match: candidate.match });
  }
  const items = filterSearchItems(
    [...entities.values()].map(({ entity, match }) => ({
      entity,
      match,
      ...saveDecision(entity, match, request.threshold ?? 75),
    })),
  );
  const coverage = channels.map(
    (channel) =>
      proposal.coverage.find((item) => item.channel === channel) ?? {
        channel,
        state: 'skipped' as const,
        searches: 0,
        reason: 'Runner did not report acquisition for this channel.',
      },
  );
  return {
    items,
    sources,
    coverage,
    gaps,
    counts: {
      leads: proposal.candidates.length,
      distinct: items.length,
      duplicates,
      omitted,
    },
  };
}

export async function signalSearch(
  input: unknown,
  dependencies: {
    runner?: SearchRunner;
    signal?: AbortSignal;
    progress?: (event: string) => void;
    fetch?: typeof fetchEvidence;
    root?: string;
  } = {},
): Promise<SearchResult> {
  const request = parseRequest(input);
  const started = Date.now();
  const limits = budgets[request.profile ?? 'wide'];
  const controller = new AbortController();
  const abort = () => controller.abort();
  dependencies.signal?.addEventListener('abort', abort, { once: true });
  if (dependencies.signal?.aborted) controller.abort();
  const timer = setTimeout(abort, limits.seconds * 1000);
  const base: SearchResult = {
    schemaVersion: 2,
    runId: randomUUID(),
    query: request.query,
    status: 'failed',
    items: [],
    sources: [],
    coverage: [],
    gaps: [],
    usage: {
      searches: 0,
      documents: 0,
      elapsedMs: 0,
      modelCalls: 0,
      providerUsage: null,
      cost: null,
    },
    counts: { leads: 0, distinct: 0, duplicates: 0, omitted: 0 },
    limits,
  };
  try {
    const runner = dependencies.runner ?? codexRunner();
    const readiness = await runner.readiness();
    dependencies.progress?.(readiness.reason);
    if (!readiness.available || !readiness.broadSearch) {
      base.status = 'not_configured';
      base.gaps = [readiness.reason];
      return base;
    }
    base.usage.modelCalls = 1;
    const discovery = await runner.discover(
      request,
      controller.signal,
      dependencies.progress ?? (() => {}),
    );
    base.usage.searches = discovery.searches;
    base.usage.providerUsage = discovery.usage;
    if (discovery.searches > limits.searches) throw new Error('budget_exhausted');
    if (request.cache === 'private')
      await atomicJson(
        resolve(dependencies.root ?? process.cwd(), '.signals/acquisitions', `${base.runId}.json`),
        {
          request,
          proposal: discovery.proposal,
          usage: discovery.usage,
          acquiredAt: new Date().toISOString(),
        },
      );
    const accepted = await acceptDiscovery(discovery.proposal, request, {
      evidenceClass: dependencies.fetch ? 'fixture' : (runner.evidenceClass ?? 'fixture'),
      signal: controller.signal,
      fetch:
        dependencies.fetch ??
        (request.cache === 'private'
          ? privateCacheFetch(dependencies.root ?? process.cwd(), dependencies.progress)
          : undefined),
      progress: dependencies.progress,
      enrich: runner.enrich
        ? async (proposal, material) => {
            base.usage.modelCalls++;
            const grounded = await runner.enrich!(
              proposal,
              material,
              request,
              controller.signal,
              dependencies.progress ?? (() => {}),
            );
            if (request.cache === 'private')
              await atomicJson(
                resolve(
                  dependencies.root ?? process.cwd(),
                  '.signals/extractions',
                  `${base.runId}.json`,
                ),
                { proposal: grounded.proposal, usage: grounded.usage },
              );
            base.usage.providerUsage = { discovery: discovery.usage, extraction: grounded.usage };
            return grounded.proposal;
          }
        : undefined,
    });
    Object.assign(base, accepted);
    base.usage.documents = base.sources.filter((source) => source.state === 'fetched').length;
    base.status = controller.signal.aborted
      ? 'cancelled'
      : base.gaps.length ||
          base.items.some((item) =>
            item.entity.observations.some((observation) => !observation.verified),
          )
        ? 'partial'
        : 'completed';
    if (request.save === 'eligible' && !controller.signal.aborted) {
      const saved = await saveEntities(
        base.items,
        'eligible',
        dependencies.root ?? process.cwd(),
        'public',
        request.threshold ?? 75,
        false,
        { runId: base.runId, query: base.query, kind: 'one-off' },
      );
      base.persistence = { changed: saved.changed, skipped: saved.skipped, privateRun: false };
    }
  } catch (failure) {
    if (failure instanceof RunnerFailure) {
      base.usage.searches = failure.searches;
      base.usage.providerUsage = failure.providerUsage;
    }
    base.status = controller.signal.aborted ? 'cancelled' : 'failed';
    base.gaps.push(failure instanceof Error ? failure.message : 'search_failed');
  } finally {
    clearTimeout(timer);
    dependencies.signal?.removeEventListener('abort', abort);
    base.usage.elapsedMs = Date.now() - started;
    if (request.cache === 'private') {
      base.persistence = {
        changed: base.persistence?.changed ?? [],
        skipped: base.persistence?.skipped ?? [],
        privateRun: true,
      };
      try {
        await retainRun(base, dependencies.root ?? process.cwd());
      } catch (failure) {
        base.persistence.privateRun = false;
        base.gaps.push(
          `Private retention failed: ${failure instanceof Error ? failure.message : 'unknown'}`,
        );
        if (base.status === 'completed') base.status = 'partial';
      }
    }
  }
  return base;
}
