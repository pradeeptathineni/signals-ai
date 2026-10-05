-- New assessments use v2; existing immutable v1 records retain their original semantics.
ALTER TABLE ops.adoption_readiness DROP CONSTRAINT adoption_readiness_policy_version_check;
ALTER TABLE ops.adoption_readiness ADD CONSTRAINT adoption_readiness_policy_version_check
  CHECK (policy_version IN ('adoption-readiness-v1', 'adoption-readiness-v2'));

-- Old observations remain useful history; a missing action does not establish a v2 runtime trial.
ALTER TABLE ops.evidence_feedback ADD COLUMN action_scope text
  CHECK (action_scope IN ('reference', 'documented_use', 'use', 'copy', 'production', 'comparison'));
