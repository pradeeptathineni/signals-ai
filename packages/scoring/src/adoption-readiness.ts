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
  completedTrial?: boolean;
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
          : input.completedTrial && input.unknowns.length === 0
            ? 'adopt'
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
        : disposition === 'adopt'
          ? 'The scoped interface and a recorded local trial support adoption; reassess on version or outcome changes.'
          : disposition === 'reference'
            ? 'Use as an attributed reference within its supported scope.'
            : 'Resolve the action-specific evidence gap before recommending adoption.',
  };
}

export interface AdoptionReadinessV2Input extends Omit<AdoptionReadinessInput, 'purpose'> {
  purpose: AdoptionReadinessInput['purpose'] | 'documented_use';
}

/** New recommendations distinguish documented practice from claims requiring a local trial. */
export function assessAdoptionReadinessV2(input: AdoptionReadinessV2Input) {
  const historical = assessAdoptionReadiness({
    ...input,
    purpose: input.purpose === 'documented_use' ? 'use' : input.purpose,
  });
  const documented = input.purpose === 'documented_use';
  const supported = input.supportedClaimIds.length > 0 && input.documentedInterface;
  const applicable = supported && input.compatibility === 'compatible';
  const disposition = historical.blockers.length
    ? 'reject'
    : input.purpose === 'reference'
      ? 'reference'
      : !applicable || input.purpose === 'production' || input.purpose === 'comparison'
        ? 'defer'
        : documented
          ? input.unknowns.length === 0
            ? 'adopt'
            : 'defer'
          : input.boundedCheck === 'passed'
            ? input.completedTrial && input.unknowns.length === 0
              ? 'adopt'
              : 'trial'
            : 'defer';
  return {
    ...historical,
    policyVersion: 'adoption-readiness-v2' as const,
    disposition,
    evidenceConfidence: input.supportedClaimIds.length ? 'source-supported' : 'unknown',
    rationale: historical.blockers.length
      ? historical.blockers.join(' ')
      : disposition === 'adopt'
        ? documented
          ? 'Supported documentation and scoped compatibility support this practice; no runtime benefit is claimed.'
          : 'A useful trial bound to this exact option supports scoped use; broader benefit remains unmeasured.'
        : disposition === 'trial'
          ? 'The documented interface passed a bounded check; record an outcome before adopting it for this use.'
          : disposition === 'reference'
            ? 'Use as an attributed reference with the reported evidence limits.'
            : 'Resolve claim freshness, applicability or the stronger action-specific evidence gap.',
  };
}
