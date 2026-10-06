import type { SearchResult } from '../../domain/src/search-contract.js';
import { type EvidenceBundle, parseEvidenceBundle } from '../../domain/src/evidence-exchange.js';
import { digest } from './search-fetch.js';

/** Compatibility transport preserves old meanings; it never translates intrinsic scores into old ratings. */
export function searchEvidenceBundle(result: SearchResult, commit: string): EvidenceBundle {
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('invalid_producer_commit');
  const sources = [
    ...new Map(
      result.items.flatMap((item) => item.entity.evidence).map((source) => [source.id, source]),
    ).values(),
  ];
  const claims = [
    ...new Map(
      result.items
        .flatMap((item) =>
          item.entity.observations.map((observation) => ({
            id: observation.id,
            text: observation.statement,
            source_ids: [observation.evidenceId],
            status: observation.verified ? observation.status : ('uncertain' as const),
          })),
        )
        .map((claim) => [claim.id, claim]),
    ).values(),
  ];
  const bundle: EvidenceBundle = {
    schema_version: 1,
    bundle_id: `search-${result.runId}`,
    mode: 'agent-assisted',
    created_at: new Date().toISOString(),
    producer: {
      repository: 'pradeeptathineni/signals-ai',
      commit,
      protocol: 'signals-evidence-v1',
    },
    need: { query: result.query },
    sources: sources.map((source) => ({
      id: source.id,
      uri: source.uri,
      title: source.title,
      source_class: source.family,
      observed_at:
        source.publishedAt &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
          source.publishedAt,
        )
          ? source.publishedAt
          : null,
      revision: source.digest,
      independence_group: source.origin,
    })),
    claims,
    candidates: result.items.map((item) => ({
      id: item.entity.id,
      name: item.entity.name,
      canonical_uri: item.entity.uri,
      claim_ids: item.entity.observations.map((observation) => observation.id),
      disposition: item.entity.assessment.score === null ? 'defer' : 'consider',
      reason: item.match.reason,
      limitations: item.entity.limits,
      signal: { evidence_confidence: 'unknown', project_fit: 'unknown' },
    })),
    limitations: [
      ...result.gaps,
      'Native signal strength is an evidence policy index. Legacy confidence/fit ratings are unmeasured. Only precise publication timestamps populate legacy observed_at; original partial dates and fetch times remain distinct in extensions. No adoption or execution authority.',
    ],
    extensions: {
      'signals-ai.native-assessments': result.items.map((item) => ({
        id: item.entity.id,
        assessment: item.entity.assessment,
      })),
      'signals-ai.source-dates': sources.map((source) => ({
        id: source.id,
        published_at: source.publishedAt,
        fetched_at: source.fetchedAt,
      })),
    },
  };
  const raw = JSON.stringify(bundle);
  return parseEvidenceBundle(raw, digest(raw));
}
