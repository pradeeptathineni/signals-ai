CREATE EXTENSION IF NOT EXISTS pgcrypto;
ALTER TABLE ops.evidence_drafts ADD CONSTRAINT evidence_drafts_exact_bytes_check
  CHECK (digest = encode(public.digest(convert_to(bytes,'UTF8'),'sha256'),'hex'));
ALTER TABLE catalog.evidence_bundles ADD CONSTRAINT evidence_bundles_exact_bytes_check
  CHECK (digest = encode(public.digest(convert_to(bytes,'UTF8'),'sha256'),'hex'));

CREATE TABLE ops.adoption_readiness (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspace.workspaces(id),
  bundle_id uuid NOT NULL REFERENCES catalog.evidence_bundles(id),
  candidate_id text NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('human','agent-reviewed')),
  policy_version text NOT NULL CHECK (policy_version='adoption-readiness-v1'),
  input jsonb NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER adoption_readiness_immutable BEFORE UPDATE OR DELETE ON ops.adoption_readiness
  FOR EACH ROW EXECUTE FUNCTION ops.reject_immutable_change();

CREATE FUNCTION ops.check_evidence_candidate_binding() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE evidence jsonb;
BEGIN
  SELECT bytes::jsonb INTO evidence FROM catalog.evidence_bundles WHERE id=NEW.bundle_id;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(evidence->'candidates') c WHERE c->>'id'=NEW.candidate_id) THEN
    RAISE EXCEPTION 'Candidate must belong to the exact evidence bundle';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER adoption_readiness_candidate_binding BEFORE INSERT ON ops.adoption_readiness
  FOR EACH ROW EXECUTE FUNCTION ops.check_evidence_candidate_binding();
CREATE TRIGGER evidence_feedback_candidate_binding BEFORE INSERT ON ops.evidence_feedback
  FOR EACH ROW EXECUTE FUNCTION ops.check_evidence_candidate_binding();
