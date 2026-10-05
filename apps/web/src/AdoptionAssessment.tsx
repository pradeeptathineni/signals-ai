import { useMutation } from '@tanstack/react-query';
import type { EvidenceBundle } from '../../../packages/domain/src/evidence-exchange.js';
import { api, formString } from './api.js';
import { ErrorPanel, StateBadge } from './ui.js';

interface Assessment {
  disposition: string;
  rationale: string;
  blockers: string[];
  unknowns: string[];
  observationBasis: string;
}

export function AdoptionAssessment({ id, bundle }: { id: string; bundle: EvidenceBundle }) {
  const assessment = useMutation({
    mutationFn: (data: FormData) => {
      const candidateId = formString(data, 'candidateId');
      const candidate = bundle.candidates.find((item) => item.id === candidateId)!;
      const supportedClaimIds = candidate.claim_ids.filter((claimId) =>
        bundle.claims.some(
          (claim) => claim.id === claimId && ['supported', 'observed'].includes(claim.status),
        ),
      );
      return api<Assessment>(`/api/v1/evidence-bundles/${id}/readiness`, {
        method: 'POST',
        body: JSON.stringify({
          candidateId,
          actor: 'human',
          purpose: formString(data, 'purpose'),
          supportedClaimIds,
          documentedInterface: data.has('documentedInterface'),
          boundedCheck: formString(data, 'boundedCheck'),
          compatibility: formString(data, 'compatibility'),
          redistribution: formString(data, 'redistribution'),
          authoritySafe: data.has('authoritySafe'),
          criticalClaimSupported: data.has('criticalClaimSupported'),
          unknowns: formString(data, 'unknowns')
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean),
          ...(formString(data, 'feedbackId') ? { feedbackId: formString(data, 'feedbackId') } : {}),
        }),
      });
    },
  });
  return (
    <details>
      <summary>Assess readiness for a particular use</summary>
      <p>
        Record your observed checks separately from the producer's recommendation. The result is
        scoped advice.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          assessment.mutate(new FormData(event.currentTarget));
        }}
      >
        <label>
          Assessment option
          <select name="candidateId" aria-label="Assessment option">
            {bundle.candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Purpose
          <select name="purpose" aria-label="Purpose">
            <option value="reference">Attributed reference</option>
            <option value="use">Use the interface</option>
            <option value="copy">Copy source</option>
            <option value="production">Production deployment</option>
            <option value="comparison">Comparative superiority</option>
          </select>
        </label>
        <label>
          Bounded check
          <select name="boundedCheck" aria-label="Bounded check">
            <option value="unknown">Not checked</option>
            <option value="passed">Passed</option>
            <option value="failed">Failed</option>
          </select>
        </label>
        <label>
          Compatibility
          <select name="compatibility" aria-label="Compatibility">
            <option value="unknown">Unknown</option>
            <option value="compatible">Compatible</option>
            <option value="incompatible">Incompatible</option>
          </select>
        </label>
        <label>
          Redistribution rights
          <select name="redistribution" aria-label="Redistribution rights">
            <option value="unknown">Unknown</option>
            <option value="allowed">Allowed</option>
            <option value="prohibited">Prohibited</option>
          </select>
        </label>
        <label className="check-label">
          <input name="documentedInterface" type="checkbox" />
          Documented interface
        </label>
        <label className="check-label">
          <input name="authoritySafe" type="checkbox" />
          Authority is safe for this purpose
        </label>
        <label className="check-label">
          <input name="criticalClaimSupported" type="checkbox" />
          Critical claims are supported
        </label>
        <label>
          Remaining unknowns, one per line
          <textarea name="unknowns" maxLength={5000} />
        </label>
        <label>
          Useful trial feedback ID (optional)
          <input name="feedbackId" />
        </label>
        <button className="button" disabled={assessment.isPending}>
          Assess scoped readiness
        </button>
      </form>
      {assessment.isError ? <ErrorPanel error={assessment.error} /> : null}
      {assessment.data ? (
        <div role="status">
          <StateBadge state={assessment.data.disposition} />
          <p>{assessment.data.rationale}</p>
          <p>{assessment.data.observationBasis}</p>
          <ul>
            {[...assessment.data.blockers, ...assessment.data.unknowns].map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </details>
  );
}
