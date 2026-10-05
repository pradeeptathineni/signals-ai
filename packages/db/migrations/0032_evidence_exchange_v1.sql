-- Exact serialized evidence is retained independently of historical research/decision protocols.
CREATE TABLE ops.evidence_drafts (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspace.workspaces(id),
  bundle_id text NOT NULL,
  bytes text NOT NULL CHECK (octet_length(bytes) <= 262144),
  digest text NOT NULL CHECK (digest ~ '^[a-f0-9]{64}$'),
  mode text NOT NULL CHECK (mode IN ('agent-assisted', 'model-led', 'offline-curated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, digest)
);
CREATE TABLE catalog.evidence_bundles (
  id uuid PRIMARY KEY,
  bundle_id text NOT NULL UNIQUE,
  bytes text NOT NULL CHECK (octet_length(bytes) <= 262144),
  digest text NOT NULL UNIQUE CHECK (digest ~ '^[a-f0-9]{64}$'),
  predecessor_id uuid UNIQUE REFERENCES catalog.evidence_bundles(id),
  change_reasons jsonb NOT NULL CHECK (jsonb_typeof(change_reasons) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ops.evidence_reviews (
  id uuid PRIMARY KEY,
  draft_id uuid NOT NULL UNIQUE REFERENCES ops.evidence_drafts(id),
  bundle_id uuid NOT NULL UNIQUE REFERENCES catalog.evidence_bundles(id),
  actor_type text NOT NULL CHECK (actor_type IN ('human', 'agent-reviewed')),
  policy_version text NOT NULL CHECK (policy_version = 'evidence-admission-v1'),
  rationale text NOT NULL CHECK (length(rationale) BETWEEN 1 AND 2000),
  checks jsonb NOT NULL,
  corpus_links jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ops.evidence_feedback (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspace.workspaces(id),
  bundle_id uuid NOT NULL REFERENCES catalog.evidence_bundles(id),
  candidate_id text NOT NULL,
  consumer_task text NOT NULL CHECK (length(consumer_task) BETWEEN 1 AND 240),
  outcome text NOT NULL CHECK (outcome IN ('useful', 'failed', 'regressed', 'not_used')),
  detail text NOT NULL CHECK (length(detail) BETWEEN 1 AND 2000),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, idempotency_key)
);
CREATE TRIGGER evidence_drafts_immutable BEFORE UPDATE OR DELETE ON ops.evidence_drafts
  FOR EACH ROW EXECUTE FUNCTION ops.reject_immutable_change();
CREATE TRIGGER evidence_bundles_immutable BEFORE UPDATE OR DELETE ON catalog.evidence_bundles
  FOR EACH ROW EXECUTE FUNCTION ops.reject_immutable_change();
CREATE TRIGGER evidence_reviews_immutable BEFORE UPDATE OR DELETE ON ops.evidence_reviews
  FOR EACH ROW EXECUTE FUNCTION ops.reject_immutable_change();
CREATE TRIGGER evidence_feedback_immutable BEFORE UPDATE OR DELETE ON ops.evidence_feedback
  FOR EACH ROW EXECUTE FUNCTION ops.reject_immutable_change();
