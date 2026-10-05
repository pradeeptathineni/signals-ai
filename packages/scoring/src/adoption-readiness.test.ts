import { expect, it } from 'vitest';
import {
  assessAdoptionReadiness,
  assessAdoptionReadinessV2,
  type AdoptionReadinessInput,
} from './adoption-readiness.js';
const base: AdoptionReadinessInput = {
  purpose: 'use',
  supportedClaimIds: ['claim'],
  documentedInterface: true,
  boundedCheck: 'passed',
  compatibility: 'compatible',
  redistribution: 'unknown',
  authoritySafe: true,
  criticalClaimSupported: true,
  unknowns: ['Comparative benefit unmeasured.'],
};
it('permits bounded trials without popularity or exhaustive comparisons', () => {
  expect(assessAdoptionReadiness(base).disposition).toBe('trial');
});
it('recommends scoped adoption only after a recorded trial and no unresolved action-specific unknown', () => {
  expect(assessAdoptionReadiness({ ...base, completedTrial: true, unknowns: [] }).disposition).toBe(
    'adopt',
  );
  expect(assessAdoptionReadiness({ ...base, completedTrial: true }).disposition).toBe('trial');
});
it('blocks unsafe authority, unsupported critical claims and disallowed copying', () => {
  for (const change of [
    { authoritySafe: false },
    { criticalClaimSupported: false },
    { purpose: 'copy' as const, redistribution: 'prohibited' as const },
  ])
    expect(assessAdoptionReadiness({ ...base, ...change }).disposition).toBe('reject');
  expect(assessAdoptionReadiness({ ...base, purpose: 'production' }).disposition).toBe('defer');
});

it('uses supported documentation without a bespoke runtime trial', () => {
  expect(
    assessAdoptionReadinessV2({
      ...base,
      purpose: 'documented_use',
      boundedCheck: 'unknown',
      unknowns: [],
    }),
  ).toMatchObject({
    policyVersion: 'adoption-readiness-v2',
    disposition: 'adopt',
    evidenceConfidence: 'source-supported',
  });
  expect(assessAdoptionReadinessV2({ ...base, purpose: 'documented_use' }).disposition).toBe(
    'defer',
  );
  expect(
    assessAdoptionReadinessV2({ ...base, purpose: 'documented_use', authoritySafe: false })
      .disposition,
  ).toBe('reject');
});

it('retains stronger runtime, copy, production and comparison requirements in v2', () => {
  const known = { ...base, unknowns: [] };
  expect(assessAdoptionReadinessV2(known).disposition).toBe('trial');
  expect(assessAdoptionReadinessV2({ ...known, completedTrial: true }).disposition).toBe('adopt');
  expect(
    assessAdoptionReadinessV2({ ...known, completedTrial: true, boundedCheck: 'unknown' })
      .disposition,
  ).toBe('defer');
  for (const purpose of ['production', 'comparison'] as const)
    expect(assessAdoptionReadinessV2({ ...known, purpose, completedTrial: true }).disposition).toBe(
      'defer',
    );
  expect(
    assessAdoptionReadinessV2({ ...known, purpose: 'copy', redistribution: 'unknown' }).disposition,
  ).toBe('reject');
  expect(assessAdoptionReadinessV2({ ...known, supportedClaimIds: [] }).disposition).toBe('defer');
});
