import { resolve } from 'node:path';
import MiniSearch from 'minisearch';
import type { Entity, SearchRequest, Source } from '../../domain/src/search-contract.js';
import { activeObservations } from '../../domain/src/search-score.js';
import { normalizeConsiderUrl } from '../../domain/src/url.js';
import { loadEntities } from './search-store.js';
import { fetchEvidence } from './search-fetch.js';

const recordLimit = 5;
const textLimit = 12000;

function sourceFacts(entity: Entity) {
  return activeObservations(entity, entity.assessment.policy)
    .filter(
      (observation) =>
        observation.verified && ['supported', 'contradicted'].includes(observation.status),
    )
    .flatMap((observation) => {
      const source = entity.evidence.find((item) => item.id === observation.evidenceId);
      if (
        !source ||
        source.state !== 'fetched' ||
        source.reason === 'provider_final_identity_unverified'
      )
        return [];
      try {
        normalizeConsiderUrl(source.uri);
      } catch {
        return [];
      }
      return [
        {
          observationId: observation.id,
          feature: observation.feature,
          status: observation.status,
          statement: observation.statement,
          quote: observation.quote,
          independent: observation.independent,
          source: {
            evidenceId: source.id,
            uri: source.uri,
            title: source.title,
            publisher: source.publisher,
            origin: source.origin,
            publishedAt: source.publishedAt,
            fetchedAt: source.fetchedAt,
          },
        },
      ];
    });
}

/** Read-only lexical reuse of bound public-source observations, never personal/runtime state. */
export async function researchCorpusSlice(request: SearchRequest, root: string) {
  const slice = {
    kind: 'retained-source-observations' as const,
    method: 'lexical' as const,
    records: [] as {
      id: string;
      name: string;
      uri: string;
      kind: Entity['kind'];
      assessmentAsOf: string;
      facts: ReturnType<typeof sourceFacts>;
      omittedFacts: number;
    }[],
    gaps: [] as string[],
  };
  const loaded = await Promise.allSettled([
    loadEntities(resolve(root, 'signals/entities')),
    loadEntities(resolve(root, '.signals/corpus/entities')),
  ]);
  const records = new Map<string, Entity>();
  for (const result of loaded) {
    if (result.status === 'rejected') {
      if (!slice.gaps.length)
        slice.gaps.push(
          'Some saved Corpus records could not be validated; native research remains available.',
        );
      continue;
    }
    for (const record of result.value) {
      const prior = records.get(record.entity.id);
      if (!prior || record.entity.assessment.asOf > prior.assessment.asOf)
        records.set(record.entity.id, record.entity);
    }
  }
  const candidates = [...records.values()].map((entity) => ({
    entity,
    facts: sourceFacts(entity),
  }));
  const index = new MiniSearch({ fields: ['name', 'text'] });
  index.addAll(
    candidates
      .filter((item) => item.facts.length)
      .map(({ entity, facts }) => ({
        id: entity.id,
        name: entity.name,
        text: facts.map((fact) => `${fact.statement} ${fact.quote} ${fact.source.title}`).join(' '),
      })),
  );
  const hits = index.search(`${request.query} ${request.context ?? ''}`, {
    combineWith: 'OR',
    fuzzy: false,
    prefix: false,
    boost: { name: 2 },
  });
  for (const hit of hits) {
    if (slice.records.length >= recordLimit) break;
    const { entity, facts } = candidates.find((item) => item.entity.id === hit.id)!;
    const selected = [...facts]
      .sort(
        (a, b) =>
          Number(b.feature === 'defining') - Number(a.feature === 'defining') ||
          Number(b.status === 'contradicted') - Number(a.status === 'contradicted'),
      )
      .slice(0, 6);
    const projection = {
      id: entity.id,
      name: entity.name,
      uri: entity.uri,
      kind: entity.kind,
      assessmentAsOf: entity.assessment.asOf,
      facts: selected,
      omittedFacts: facts.length - selected.length,
    };
    while (
      projection.facts.length &&
      JSON.stringify({ ...slice, records: [...slice.records, projection] }).length > textLimit
    ) {
      projection.facts.pop();
      projection.omittedFacts++;
    }
    if (projection.facts.length) slice.records.push(projection);
  }
  if (hits.length > slice.records.length)
    slice.gaps.push(
      'Saved-knowledge context is a bounded lexical slice; remaining matching records were not supplied.',
    );
  // Reserve room for the bounded-slice gap without truncating statements or source spans.
  while (JSON.stringify(slice).length > textLimit) slice.records.pop();
  return slice;
}

function checkablePrimary(entity: Entity): Source | undefined {
  const defining = new Set(
    activeObservations(entity, entity.assessment.policy)
      .filter(
        (observation) =>
          observation.verified &&
          observation.feature === 'defining' &&
          observation.status === 'supported',
      )
      .map((observation) => observation.evidenceId),
  );
  return entity.evidence.find(
    (source) =>
      defining.has(source.id) &&
      source.state === 'fetched' &&
      source.reason !== 'provider_final_identity_unverified' &&
      (source.family === 'primary' || source.role === 'primary'),
  );
}

/** A primary hash check says only whether that material changed; it never renews claims. */
export async function checkPrimaryMaterial(
  entity: Entity,
  options: { fetch?: typeof fetchEvidence; signal?: AbortSignal } = {},
) {
  options.signal?.throwIfAborted();
  const source = checkablePrimary(entity);
  const base = {
    kind: 'primary-material-check' as const,
    entityId: entity.id,
    source: source ? structuredClone(source) : null,
    checkedAt: new Date().toISOString(),
    claimsRenewed: false as const,
    independentChangesChecked: false as const,
    modelCalls: 0,
  };
  if (!source?.digest)
    return {
      ...base,
      status: 'not-checkable' as const,
      reason: 'No bound defining primary material is available.',
      material: null,
    };
  try {
    normalizeConsiderUrl(source.uri);
    const material = await (options.fetch ?? fetchEvidence)(source.uri, options.signal, 0, false, {
      conditional: source.transport,
      allowNotModified: !!source.transport && !!source.digest,
    });
    options.signal?.throwIfAborted();
    const expected = normalizeConsiderUrl(source.finalUri ?? source.uri).normalizedUrl;
    if (
      material.identityUnverified ||
      normalizeConsiderUrl(material.uri).normalizedUrl !== expected
    )
      return {
        ...base,
        status: 'identity-changed' as const,
        reason:
          'The fetched primary identity is changed or unverified; interpretation is required.',
        material,
      };
    const unchanged =
      material.response?.status === 304 ||
      (source.digest === material.digest && source.normalizer === material.normalizer);
    return {
      ...base,
      status: unchanged ? ('unchanged' as const) : ('changed' as const),
      reason: unchanged
        ? 'This primary material is unchanged. Retained claims keep their original dates; independent developments were not checked.'
        : 'Primary material or its text representation changed; interpretation is required.',
      material,
    };
  } catch (error) {
    if (options.signal?.aborted) throw error;
    const reason =
      error instanceof Error && /^[a-z0-9_]+$/.test(error.message)
        ? error.message
        : 'primary_material_check_failed';
    return { ...base, status: 'failed' as const, reason, material: null };
  }
}
