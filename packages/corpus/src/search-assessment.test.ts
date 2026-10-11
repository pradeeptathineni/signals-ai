import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { acceptDiscovery } from './signal-search.js';
import { decodeNativeResearch } from '../../domain/src/search-native.js';
import {
  assessEntity,
  filterSearchItems,
  personalSaveDecision,
} from '../../domain/src/search-score.js';
import { saveEntities, loadEntities, validateEntity, retainRun, loadRun } from './search-store.js';
import type { SignalJudgment } from '../../domain/src/search-assessment.js';
import { budgets, type SearchResult } from '../../domain/src/search-contract.js';

const date = '2026-10-10T12:00:00.000Z';
const quote = 'Inspectable work demonstrates the advertised capability.';
const fact = (signal: string, source = 0, independent = false) => ({
  signal,
  source,
  independent,
  origin: `origin-${source}`,
  status: 'supported',
  statement: quote,
  quote,
});
function native(version = 4) {
  const observations = [
    fact('defining/defines'),
    fact('maturity/documented'),
    fact('verification/worked-example'),
    fact('currentness/current'),
    fact('corroboration/applied', 1, true),
    fact('verification/independent-applied', 2, true),
  ];
  const judgment: SignalJudgment = {
    rubric: 'software-v1',
    rubricReason: 'Inspectable software tool.',
    dimensions: {
      basis: { level: 4, reason: 'Original defining identity.', observations: [0] },
      work: {
        level: 3,
        reason: 'Inspectable independently applied operation.',
        observations: [1, 2, 4, 5],
      },
      scrutiny: { level: 3, reason: 'Two distinct-origin applications.', observations: [4, 5] },
      applicability: { level: 3, reason: 'Current supported scope inspected.', observations: [3] },
    },
    contrary: 'inspected',
    status: 'inspected',
    gaps: [],
  };
  return {
    version,
    answer: 'Useful candidate with inspected evidence.',
    interpretation: {
      policy: 'query-relevance-v1',
      need: 'Inspect a useful tool.',
      constraints: [],
      resourceTypes: ['software'],
      timeWindow: null,
    },
    sources: [0, 1, 2].map((index) => ({
      uri: `https://source-${index}.example.org/resource`,
      title: `Source ${index}`,
      publisher: `Publisher ${index}`,
      origin: `origin-${index}`,
      family: 'primary',
      publishedAt: date,
    })),
    candidates: [
      {
        uri: 'https://source-0.example.org/tool',
        name: 'Useful tool',
        kind: 'software',
        identity: 'resolved',
        description: 'Tool with inspected supporting work.',
        capabilities: ['inspection'],
        observations,
        match: { level: 'direct', reason: 'Directly serves the need.', sources: [0] },
        relevance: {
          value: 100,
          reason: 'Addresses all inspected constraints.',
          sources: [0],
          constraints: [],
        },
        signalJudgment: judgment,
        limits: [],
      },
    ],
    coverage: [],
    gaps: [],
  };
}
const fetched = async (uri: string) => ({ uri, text: quote, digest: 'a'.repeat(64) });
async function accept(input = native()) {
  return acceptDiscovery(
    input,
    { query: 'Inspect a useful tool.', route: 'native', profile: 'wide' },
    { asOf: date, fetch: fetched },
  );
}

describe('native successor assessment and historical capacity', () => {
  it('accepts a justified high v7 through the ordinary native decoder and preserves replay', async () => {
    const result = await accept();
    const item = result.items[0]!;
    expect(item.entity.assessment).toMatchObject({
      policy: 'signal-strength-v7',
      rubric: 'software-v1',
      score: 81,
      disposition: 'completed',
    });
    expect(item.relevance?.value).toBe(100);
    expect(personalSaveDecision(item.entity, item.match, item.relevance).eligible).toBe(true);
    expect(validateEntity(item.entity)).toEqual(item.entity);
    const root = await realpath(await mkdtemp(join(tmpdir(), 'signals-successor-')));
    try {
      await saveEntities([item], 'manual', root, 'private', 75, true);
      expect(
        (await loadEntities(join(root, '.signals/corpus/entities')))[0]?.entity.assessment,
      ).toEqual(item.entity.assessment);
      const stored: SearchResult = {
        ...result,
        schemaVersion: 2,
        runId: randomUUID(),
        query: 'Inspect a useful tool.',
        status: 'completed',
        usage: {
          searches: 0,
          documents: 3,
          elapsedMs: 0,
          modelCalls: 0,
          providerUsage: null,
          cost: null,
        },
        limits: budgets.wide,
      };
      await retainRun(stored, root);
      const replay = await loadRun(stored.runId, root);
      expect(replay.interpretation).toEqual(result.interpretation);
      expect(replay.items[0]?.relevance).toEqual(item.relevance);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('retains the seventh adverse and defining observations in v3 and holds exhausted v4 material', async () => {
    const old = native(3);
    old.candidates[0]!.observations.push(fact('risk/decisive', 1, true));
    expect(decodeNativeResearch(old).proposal.candidates[0]?.observations).toHaveLength(7);
    expect((await accept(old)).items[0]!.entity.assessment.score).toBeLessThan(81);
    old.candidates[0]!.observations = [
      ...Array.from({ length: 6 }, () => fact('maturity/documented')),
      fact('defining/defines'),
    ];
    delete (old.candidates[0] as { signalJudgment?: SignalJudgment }).signalJudgment;
    expect((await accept(old)).items[0]!.entity.assessment.score).not.toBeNull();
    const exceeded = native();
    exceeded.candidates[0]!.observations.push(
      ...Array.from({ length: 24 }, () => fact('maturity/documented')),
      fact('risk/decisive', 1, true),
    );
    const result = await accept(exceeded);
    expect(result.items[0]?.entity.observations.some((item) => item.feature === 'risk')).toBe(true);
    expect(result.gaps.join(' ')).toContain('deferred');
    expect(result.items[0]?.entity.assessment.score).toBeNull();
  });
  it('removes the old ordinary v6 ceiling without lowering its admission threshold or changing replay', async () => {
    const input = native(3);
    delete (input.candidates[0] as { signalJudgment?: SignalJudgment }).signalJudgment;
    input.sources.push({
      ...input.sources[2]!,
      uri: 'https://fourth.example.org/resource',
      publisher: 'Fourth publisher',
      origin: 'fourth',
    });
    input.candidates[0]!.observations = [
      fact('defining/defines'),
      ...['track-record', 'stable-interface', 'supported-or-complete', 'documented'].map(
        (indicator) => fact(`maturity/${indicator}`),
      ),
      ...[1, 2, 3].flatMap((source) => [
        fact('corroboration/applied', source, true),
        fact('adoption/broad', source, true),
      ]),
      fact('verification/replicated', 1, true),
      fact('authority/recognized'),
      fact('currentness/current'),
    ];
    const item = (await accept(input)).items[0]!;
    expect(item.entity.assessment.policy).toBe('signal-strength-v6');
    expect(item.entity.assessment.score).toBeGreaterThanOrEqual(75);
    expect(item.eligible).toBe(true);
    for (const policy of [
      'signal-strength-v0',
      'signal-strength-v1',
      'signal-strength-v2',
      'signal-strength-v3',
      'signal-strength-v4',
      'signal-strength-v5',
      'signal-strength-v6',
    ] as const)
      expect(assessEntity(item.entity, date, policy).score).toBe(
        ['signal-strength-v0', 'signal-strength-v1', 'signal-strength-v2'].includes(policy)
          ? 58
          : 88,
      );
  });
  it('distinguishes unknown decisive support, nondecisive uncertainty and established low quality', async () => {
    const unknown = native();
    unknown.candidates[0]!.signalJudgment.dimensions.work.level = null;
    expect((await accept(unknown)).items[0]?.entity.assessment).toMatchObject({
      score: null,
      disposition: 'not-scoreable',
    });
    const provisional = native();
    provisional.candidates[0]!.signalJudgment.dimensions.scrutiny.level = null;
    const item = (await accept(provisional)).items[0]!;
    expect(item.entity.assessment).toMatchObject({ score: 63, disposition: 'provisional' });
    expect(personalSaveDecision(item.entity, item.match, item.relevance).eligible).toBe(false);
    const weak = native();
    weak.candidates[0]!.observations.push(fact('risk/material', 1, true));
    expect((await accept(weak)).items[0]?.entity.assessment).toMatchObject({
      score: 50,
      disposition: 'completed',
    });
  });
  it('does not credit adverse scrutiny, correlated creators or manipulated attention', async () => {
    const adverse = native();
    adverse.candidates[0]!.observations[4] = fact('risk/material', 1, true);
    adverse.candidates[0]!.observations[5] = fact('risk/material', 2, true);
    expect(
      (await accept(adverse)).items[0]?.entity.assessment.features.scrutiny?.contribution,
    ).toBe(0);
    const mirrors = native();
    mirrors.sources[1]!.publisher = mirrors.sources[0]!.publisher;
    mirrors.sources[2]!.origin = mirrors.sources[1]!.origin;
    expect(
      (await accept(mirrors)).items[0]?.entity.assessment.features.scrutiny?.contribution,
    ).toBe(0);
    const attention = native();
    const popularity = {
      ...fact('adoption/attention'),
      quote: 'Measured 10000 stars demonstrate public attention.',
      statement: 'Measured stars.',
      attention: { metric: 'stars' as const, value: 10000 },
    };
    attention.candidates[0]!.observations[4] = popularity;
    attention.candidates[0]!.observations[5] = popularity;
    const result = await acceptDiscovery(
      attention,
      { query: 'A useful tool', route: 'native' },
      {
        asOf: date,
        fetch: async (uri) => ({
          uri,
          text: `${quote} ${popularity.quote}`,
          digest: 'a'.repeat(64),
        }),
      },
    );
    expect(result.items[0]?.entity.assessment.features.scrutiny?.contribution).toBe(5);
    popularity.attention.value = 100000;
    expect(decodeNativeResearch(attention).proposal.gaps.join(' ')).toContain('unbound attention');
  });
  it('uses standards 40/20/10/30, stable relevance ties and holds stale decisive status', async () => {
    const standard = native();
    standard.candidates[0]!.kind = 'standard';
    standard.candidates[0]!.signalJudgment.rubric = 'standard-v1';
    standard.candidates[0]!.signalJudgment.dimensions.scrutiny.level = null;
    standard.candidates[0]!.signalJudgment.dimensions.work.level = 2;
    standard.candidates[0]!.signalJudgment.dimensions.applicability.level = 4;
    standard.candidates[0]!.observations.push(fact('authority/formal-current'));
    standard.candidates[0]!.signalJudgment.dimensions.basis.observations = [0, 6];
    standard.candidates[0]!.signalJudgment.dimensions.applicability.observations = [3, 6];
    expect((await accept(standard)).items[0]?.entity.assessment.score).toBe(80);
    const a = (await accept()).items[0]!;
    const b = structuredClone(a);
    a.entity.id = 'z';
    b.entity.id = 'a';
    b.entity.assessment.score = null;
    expect(filterSearchItems([a, b])[0]?.entity.id).toBe('a');
    expect(
      assessEntity(
        (await accept()).items[0]!.entity,
        '2028-10-10T00:00:00.000Z',
        'signal-strength-v7',
      ).score,
    ).toBeNull();
  });
  it('rejects ordinal promotion beyond inspected evidence classes and requires official standard status', async () => {
    const promoted = native();
    promoted.candidates[0]!.observations[2] = fact('verification/inspectable');
    promoted.candidates[0]!.observations[3] = fact('authority/secondary');
    promoted.candidates[0]!.signalJudgment.dimensions.work = {
      level: 4,
      reason: 'Unsupported maximum.',
      observations: [2],
    };
    promoted.candidates[0]!.signalJudgment.dimensions.applicability.level = 4;
    const item = (await accept(promoted)).items[0]!;
    expect(item.entity.assessment.features.work?.contribution).toBe(6.25);
    expect(item.entity.assessment.features.applicability?.contribution).toBe(6.25);
    const standard = native();
    standard.candidates[0]!.kind = 'standard';
    standard.candidates[0]!.signalJudgment.rubric = 'standard-v1';
    const official = (await accept(standard)).items[0]!;
    expect(official.entity.assessment.features.basis?.contribution).toBe(10);
    expect(official.entity.assessment.score).toBeNull();
    expect(official.entity.assessment.reasons?.join(' ')).toContain('issuer');
  });
  it('removes future and stale scrutiny credit while keeping valid decisive evidence provisional', async () => {
    for (const invalidDate of ['2027-10-10T00:00:00.000Z', '2024-10-10T00:00:00.000Z']) {
      const item = (await accept()).items[0]!;
      const scrutiny = item.entity.signalBasis!.dimensions.scrutiny.observations;
      for (const source of item.entity.evidence)
        if (
          item.entity.observations.some(
            (observation) =>
              scrutiny.includes(observation.id) && observation.evidenceId === source.id,
          )
        ) {
          source.fetchedAt = invalidDate;
          item.entity.currentChecks![source.uri] = invalidDate;
        }
      // Keep work's valid creator example separate from invalid independent material.
      item.entity.signalBasis!.dimensions.work.observations =
        item.entity.signalBasis!.dimensions.work.observations.filter(
          (id) => !scrutiny.includes(id),
        );
      const assessment = assessEntity(item.entity, date, 'signal-strength-v7');
      expect(assessment.features.scrutiny?.contribution).toBe(0);
      expect(assessment.disposition).toBe('provisional');
      expect(assessment.nextVerification).toContain('current');
    }
  });
  it('holds stale adverse evidence even when a dimension judgment omitted its reference', async () => {
    const input = native();
    input.sources.push({
      ...input.sources[2]!,
      uri: 'https://adverse.example.net/material',
      publisher: 'Adverse inspector',
      origin: 'adverse',
    });
    input.candidates[0]!.observations.push(fact('risk/decisive', 3, true));
    const item = (await accept(input)).items[0]!;
    const risk = item.entity.observations.find((entry) => entry.feature === 'risk')!;
    const source = item.entity.evidence.find((entry) => entry.id === risk.evidenceId)!;
    source.fetchedAt = '2024-10-10T00:00:00.000Z';
    item.entity.currentChecks![source.uri] = source.fetchedAt;
    item.entity.assessment = assessEntity(item.entity, date, 'signal-strength-v7');
    expect(item.entity.assessment.score).toBeNull();
    expect(item.entity.assessment.reasons?.join(' ')).toContain('adverse evidence');
    expect(personalSaveDecision(item.entity, item.match, item.relevance).eligible).toBe(false);
  });
  it('bounds total native observations at 240 while preserving late defining/adverse material and omission holds', async () => {
    const input = native();
    const candidate = input.candidates[0]!;
    candidate.observations.push(...Array.from({ length: 18 }, () => fact('maturity/documented')));
    input.candidates = Array.from({ length: 12 }, (_, index) => ({
      ...structuredClone(candidate),
      name: `Candidate ${index}`,
      uri: `https://source-0.example.org/tool-${index}`,
    }));
    input.candidates[11]!.observations[23] = fact('risk/decisive', 2, true);
    const decoded = decodeNativeResearch(input);
    expect(decoded.proposal.candidates.flatMap((item) => item.observations)).toHaveLength(240);
    expect(
      decoded.proposal.candidates[11]?.observations.some((item) => item.feature === 'defining'),
    ).toBe(true);
    expect(
      decoded.proposal.candidates[11]?.observations.some((item) => item.feature === 'risk'),
    ).toBe(true);
    expect(
      decoded.proposal.candidates.reduce(
        (sum, item) => sum + (item.inspection?.deferredObservations ?? 0),
        0,
      ),
    ).toBe(48);
    const result = await accept(input);
    expect(
      result.items
        .filter((item) => item.entity.inspection?.state === 'deferred')
        .every((item) => item.entity.assessment.score === null && !item.eligible),
    ).toBe(true);
  });
});
