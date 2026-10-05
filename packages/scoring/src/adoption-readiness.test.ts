import { expect, it } from 'vitest';
import { assessAdoptionReadiness, type AdoptionReadinessInput } from './adoption-readiness.js';
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
