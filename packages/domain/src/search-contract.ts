import { Type, type Static } from 'typebox';
import { Value } from 'typebox/value';
import { normalizeConsiderUrl } from './url.js';

const closed = { additionalProperties: false };
const text = Type.String({ minLength: 1, maxLength: 1600 });
const label = Type.String({ minLength: 1, maxLength: 200 });
const labels = Type.Array(label, { maxItems: 40, uniqueItems: true });
import { kinds, channels } from './search-vocabulary.js';
import type { budgets } from './search-vocabulary.js';
export { channels, budgets } from './search-vocabulary.js';
const enumOf = <const T extends string>(values: readonly T[]) => Type.Enum<T[]>(values);
export const indicators = {
  corroboration: ['applied', 'mention', 'promotion', 'unknown'],
  adoption: ['unknown', 'attention', 'single-user', 'multiple-users', 'sustained', 'broad'],
  maturity: ['track-record', 'stable-interface', 'supported-or-complete', 'documented'],
  currentness: ['current', 'minor-gaps', 'mixed', 'stale', 'unknown'],
  authority: ['secondary', 'primary', 'recognized', 'formal-current', 'unknown'],
  verification: ['inspectable', 'worked-example', 'independent-applied', 'replicated', 'unknown'],
  risk: ['bounded', 'material', 'decisive'],
  defining: ['defines'],
} as const;
export const observationSchema = Type.Object(
  {
    source: Type.Integer({ minimum: 0, maximum: 59 }),
    feature: enumOf(Object.keys(indicators)),
    indicator: Type.Enum([...new Set(Object.values(indicators).flat())]),
    statement: text,
    quote: Type.String({ minLength: 1, maxLength: 400 }),
    independent: Type.Boolean(),
    origin: label,
    status: enumOf(['supported', 'contradicted', 'uncertain']),
    attention: Type.Optional(
      Type.Object(
        {
          metric: enumOf(['stars', 'forks', 'downloads', 'points', 'mentions']),
          value: Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
        },
        closed,
      ),
    ),
  },
  closed,
);
export const candidateSchema = Type.Object(
  {
    uri: Type.String({ maxLength: 2048 }),
    name: label,
    kind: enumOf(kinds),
    identity: enumOf(['resolved', 'ambiguous']),
    aliases: labels,
    description: text,
    facets: Type.Object(
      {
        domains: labels,
        capabilities: labels,
        interfaces: labels,
        deliveryForms: labels,
        platforms: labels,
        licenses: labels,
        tags: labels,
      },
      closed,
    ),
    observations: Type.Array(observationSchema, { maxItems: 100 }),
    match: Type.Object(
      {
        level: enumOf(['direct', 'related', 'unknown', 'out-of-scope']),
        reason: text,
        sources: Type.Array(Type.Integer({ minimum: 0, maximum: 59 }), {
          maxItems: 60,
          uniqueItems: true,
        }),
      },
      closed,
    ),
    limits: Type.Array(text, { maxItems: 30 }),
  },
  closed,
);
export const proposalSchema = Type.Object(
  {
    sources: Type.Array(
      Type.Object(
        {
          uri: Type.String({ maxLength: 2048 }),
          title: label,
          publisher: label,
          family: enumOf(channels),
          publishedAt: Type.Union([Type.String({ maxLength: 40 }), Type.Null()]),
          origin: label,
        },
        closed,
      ),
      { maxItems: 60 },
    ),
    candidates: Type.Array(candidateSchema, { maxItems: 60 }),
    coverage: Type.Array(
      Type.Object(
        {
          channel: enumOf(channels),
          state: enumOf([
            'searched',
            'skipped',
            'denied',
            'failed',
            'not_configured',
            'budget_exhausted',
          ]),
          searches: Type.Integer({ minimum: 0, maximum: 24 }),
          reason: text,
        },
        closed,
      ),
      { maxItems: 12 },
    ),
    gaps: Type.Array(text, { maxItems: 30 }),
  },
  closed,
);
const requestSchema = Type.Object(
  {
    query: Type.String({ minLength: 1, maxLength: 2000 }),
    context: Type.Optional(Type.String({ maxLength: 4000 })),
    supplementalSites: Type.Optional(
      Type.Array(Type.String({ maxLength: 2048 }), { maxItems: 20, uniqueItems: true }),
    ),
    runner: Type.Optional(Type.Literal('codex')),
    sources: Type.Optional(
      Type.Array(Type.Enum(channels), { minItems: 1, maxItems: 12, uniqueItems: true }),
    ),
    profile: Type.Optional(enumOf(['quick', 'wide'])),
    save: Type.Optional(enumOf(['never', 'eligible'])),
    cache: Type.Optional(enumOf(['memory', 'private'])),
    threshold: Type.Optional(Type.Integer({ minimum: 0, maximum: 100 })),
  },
  closed,
);
export type SearchRequest = Static<typeof requestSchema>;
export type Proposal = Static<typeof proposalSchema>;
type Candidate = Static<typeof candidateSchema>;
type Observation = Static<typeof observationSchema>;
export type Source = Proposal['sources'][number] & {
  id: string;
  fetchedAt: string;
  digest: string | null;
  excerptDigest?: string;
  normalizer?: 'text-v2';
  state: 'fetched' | 'failed' | 'denied';
  reason: string;
  excerpt: string;
};
export interface Entity extends Omit<Candidate, 'observations' | 'match'> {
  id: string;
  acquisition?: 'configured-live' | 'native-agent' | 'fixture';
  currentEvidence?: string[];
  currentChecks?: Record<string, string>;
  observations: (Omit<Observation, 'source'> & {
    id: string;
    identityVersion?: 2;
    basisId: string;
    supersedes: string[];
    evidenceId: string;
    verified: boolean;
    derivation: 'model-assessment';
  })[];
  evidence: Source[];
  assessment: Assessment;
}
export interface Assessment {
  policy:
    | 'signal-strength-v0'
    | 'signal-strength-v1'
    | 'signal-strength-v2'
    | 'signal-strength-v3'
    | 'signal-strength-v4'
    | 'signal-strength-v5'
    | 'signal-strength-v6';
  asOf: string;
  score: number | null;
  features: Record<
    string,
    {
      value: number;
      contribution: number;
      observations: string[];
      state: 'observed' | 'unknown' | 'not-applicable';
    }
  >;
  risk: number;
  coverage: number;
  missing: string[];
  state: 'assessed' | 'provisional' | 'unassessed';
}
export interface SearchItem {
  entity: Entity;
  match: Candidate['match'];
  eligible: boolean;
  reasons: string[];
}
export interface SearchResult {
  schemaVersion: 2;
  runId: string;
  query: string;
  status: 'completed' | 'partial' | 'cancelled' | 'failed' | 'not_configured';
  items: SearchItem[];
  sources: Source[];
  coverage: Proposal['coverage'];
  gaps: string[];
  usage: {
    searches: number;
    documents: number;
    elapsedMs: number;
    modelCalls: number;
    providerUsage: unknown;
    cost: null;
  };
  counts: { leads: number; distinct: number; duplicates: number; omitted: number };
  limits: typeof budgets.quick;
  persistence?: { changed: string[]; skipped: string[]; privateRun: boolean };
}
export function parseRequest(input: unknown): SearchRequest {
  if (!Value.Check(requestSchema, input) || !input.query.trim()) throw new Error('invalid_request');
  const sites = (input.supplementalSites ?? []).map((site) => {
    const original = new URL(site);
    if (original.search || original.hash) throw new Error('invalid_supplemental_site');
    return normalizeConsiderUrl(site).normalizedUrl;
  });
  return { ...input, supplementalSites: [...new Set(sites)] };
}
export function parseProposal(input: unknown): Proposal {
  if (!Value.Check(proposalSchema, input)) throw new Error('invalid_model_output');
  const proposal = input;
  const unique = new Set(proposal.coverage.map((item) => item.channel));
  if (unique.size !== proposal.coverage.length) throw new Error('duplicate_coverage');
  for (const candidate of proposal.candidates) {
    for (const observation of candidate.observations) {
      if (!attentionBound(observation)) throw new Error('unbound_attention_count');
      if (
        !proposal.sources[observation.source] ||
        !Object.hasOwn(indicators, observation.feature) ||
        !(indicators[observation.feature as keyof typeof indicators] as readonly string[]).includes(
          observation.indicator,
        )
      )
        throw new Error('invalid_evidence_binding');
    }
    if (candidate.match.sources.some((index) => !proposal.sources[index]))
      throw new Error('invalid_match_binding');
  }
  return proposal;
}
export function attentionBound(
  observation: Pick<Observation, 'attention' | 'quote' | 'feature' | 'indicator'>,
) {
  return (
    !observation.attention ||
    (observation.feature === 'adoption' &&
      observation.indicator === 'attention' &&
      (observation.quote.match(/\d+(?:[,_]\d{3})*/g) ?? []).some(
        (number) => Number(number.replace(/[,_]/g, '')) === observation.attention!.value,
      ))
  );
}
