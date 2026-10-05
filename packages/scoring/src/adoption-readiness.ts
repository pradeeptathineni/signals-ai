export interface AdoptionReadinessInput {
  purpose: 'reference' | 'use' | 'copy' | 'production' | 'comparison';
  supportedClaimIds: string[];
  documentedInterface: boolean;
  boundedCheck: 'passed' | 'failed' | 'unknown';
  compatibility: 'compatible' | 'incompatible' | 'unknown';
  redistribution: 'allowed' | 'prohibited' | 'unknown';
  authoritySafe: boolean;
  criticalClaimSupported: boolean;
  unknowns: string[];
}

export function assessAdoptionReadiness(input: AdoptionReadinessInput) {
  const blockers = [
    ...(!input.authoritySafe ? ['Unsafe authority.'] : []),
    ...(input.compatibility === 'incompatible' ? ['Incompatible platform or contract.'] : []),
    ...(!input.criticalClaimSupported ? ['Critical claim unsupported.'] : []),
    ...(input.boundedCheck === 'failed' ? ['Required bounded check failed.'] : []),
    ...(input.purpose === 'copy' && input.redistribution !== 'allowed'
      ? ['Redistribution not established.']
      : []),
  ];
  const disposition = blockers.length
    ? 'reject'
    : input.purpose === 'reference'
      ? 'reference'
      : input.supportedClaimIds.length &&
          input.documentedInterface &&
          input.boundedCheck === 'passed' &&
          input.compatibility === 'compatible'
        ? input.purpose === 'production' || input.purpose === 'comparison'
          ? 'defer'
          : 'trial'
        : 'defer';
  return {
    policyVersion: 'adoption-readiness-v1' as const,
    disposition,
    evidenceConfidence: input.supportedClaimIds.length ? 'medium' : 'unknown',
    evidenceIds: [...new Set(input.supportedClaimIds)],
    blockers,
    unknowns: [...input.unknowns],
    rationale: blockers.length
      ? blockers.join(' ')
      : disposition === 'trial'
        ? 'Documented, compatible interface passed a bounded check; broader benefit remains unmeasured.'
        : disposition === 'reference'
          ? 'Use as an attributed reference within its supported scope.'
          : 'Resolve the action-specific evidence gap before recommending adoption.',
  };
}
