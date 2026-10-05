import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { EvidenceBundle } from '../../../../packages/domain/src/evidence-exchange.js';
import { api, formatDate, formString } from '../api.js';
import { Empty, ErrorPanel, Loading, PageHeader, StateBadge } from '../ui.js';
import { AdoptionAssessment } from '../AdoptionAssessment.js';

interface Draft {
  id: string;
  bundleId: string;
  mode: string;
  digest: string;
  createdAt: string;
  actor: string | null;
  admittedId: string | null;
  rationale: string | null;
}
interface Detail {
  bytes: string;
  digest: string;
  predecessorId?: string | null;
  changes?: string[];
}

function download(name: string, bytes: string) {
  const uri = URL.createObjectURL(new Blob([bytes], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = uri;
  link.download = name;
  link.click();
  URL.revokeObjectURL(uri);
}

export function ExchangePage() {
  const client = useQueryClient();
  const [selected, setSelected] = useState<Draft | null>(null);
  const [bytes, setBytes] = useState('');
  const [digest, setDigest] = useState('');
  const [rationale, setRationale] = useState('');
  const [predecessorId, setPredecessorId] = useState('');
  const [localError, setLocalError] = useState<Error | null>(null);
  const list = useQuery({
    queryKey: ['evidence-exchange'],
    queryFn: () => api<{ items: Draft[] }>('/api/v1/evidence-bundles'),
  });
  const detail = useQuery({
    queryKey: ['evidence-detail', selected?.id, selected?.admittedId],
    enabled: Boolean(selected),
    queryFn: () =>
      api<Detail>(
        selected!.admittedId
          ? `/api/v1/evidence-bundles/${selected!.admittedId}/export`
          : `/api/v1/evidence-drafts/${selected!.id}`,
      ),
  });
  const bundle = detail.data ? (JSON.parse(detail.data.bytes) as EvidenceBundle) : null;
  async function reassess() {
    if (!bundle || !selected?.admittedId) return;
    const successor = {
      ...bundle,
      mode: 'agent-assisted' as const,
      bundle_id: `${bundle.bundle_id}-${crypto.randomUUID().slice(0, 8)}`,
      created_at: new Date().toISOString(),
    };
    const nextBytes = JSON.stringify(successor, null, 2) + '\n';
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nextBytes));
    setBytes(nextBytes);
    setDigest(
      Array.from(new Uint8Array(hash))
        .map((value) => value.toString(16).padStart(2, '0'))
        .join(''),
    );
    setPredecessorId(selected.admittedId);
    document.querySelector<HTMLDetailsElement>('.exchange-import')!.open = true;
    document.querySelector<HTMLTextAreaElement>('.exchange-import textarea')?.focus();
  }
  const submit = useMutation({
    mutationFn: () =>
      api<{ id: string }>('/api/v1/evidence-drafts', {
        method: 'POST',
        body: JSON.stringify({ bytes, digest: digest.trim() }),
      }),
    onSuccess: async () => {
      setBytes('');
      setDigest('');
      await client.invalidateQueries({ queryKey: ['evidence-exchange'] });
    },
  });
  const review = useMutation({
    mutationFn: () =>
      api<{ id: string }>(`/api/v1/evidence-drafts/${selected!.id}/review`, {
        method: 'POST',
        body: JSON.stringify({
          actor: 'human',
          rationale,
          blockers: [],
          ...(predecessorId ? { predecessorId } : {}),
        }),
      }),
    onSuccess: async (result) => {
      setSelected({ ...selected!, admittedId: result.id, actor: 'human', rationale });
      await client.invalidateQueries({ queryKey: ['evidence-exchange'] });
      await client.invalidateQueries({ queryKey: ['corpus'] });
    },
  });
  const feedback = useMutation({
    mutationFn: (input: {
      candidateId: string;
      consumerTask: string;
      actionScope: string;
      outcome: string;
      detail: string;
    }) =>
      api(`/api/v1/evidence-bundles/${selected!.admittedId}/feedback`, {
        method: 'POST',
        body: JSON.stringify({ ...input, idempotencyKey: crypto.randomUUID() }),
      }),
  });
  return (
    <div className="page-shell">
      <PageHeader
        eyebrow="Evidence exchange"
        title="Make useful evidence portable"
        description="Import a cited draft, review its claims, and export an admitted revision. Research mode, source history and limitations travel with the evidence."
      />
      <div className="exchange-layout">
        <section aria-labelledby="drafts-title" className="exchange-index">
          <h2 id="drafts-title">Evidence library</h2>
          {list.isPending ? <Loading /> : null}
          {list.isError ? <ErrorPanel error={list.error} /> : null}
          {list.data?.items.length === 0 ? (
            <Empty title="Start with a real evidence draft">
              Use your agent to acquire public sources, or project a completed configured research
              run. Keep private project context out of the bundle.
            </Empty>
          ) : null}
          <ul className="exchange-list">
            {list.data?.items.map((draft) => (
              <li key={draft.id}>
                <button
                  type="button"
                  aria-pressed={selected?.id === draft.id}
                  onClick={() => {
                    setSelected(draft);
                    review.reset();
                    feedback.reset();
                  }}
                >
                  <strong>{draft.bundleId}</strong>
                  <span>
                    {draft.mode} · {draft.admittedId ? 'Admitted' : 'Awaiting review'}
                  </span>
                  <small>{formatDate(draft.createdAt)}</small>
                </button>
              </li>
            ))}
          </ul>
          <details className="exchange-import">
            <summary>Import an evidence draft</summary>
            <p>
              Choose the exact JSON bytes and its SHA-256 sidecar. A valid draft remains untrusted
              until review.
            </p>
            <p>
              For a reassessment, recheck the sources and edit material claims before submitting.
              Existing observation dates remain unchanged.
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                submit.mutate();
              }}
            >
              <label>
                Evidence JSON file
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      if (file.size > 262144) {
                        setLocalError(new Error('Evidence exceeds 256 KiB.'));
                        return;
                      }
                      void file
                        .text()
                        .then(setBytes)
                        .catch((error) => setLocalError(error as Error));
                    }
                  }}
                />
              </label>
              <label>
                SHA-256 sidecar
                <input
                  type="file"
                  accept=".sha256,text/plain"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file)
                      void file
                        .text()
                        .then((value) => setDigest(value.trim()))
                        .catch((error) => setLocalError(error as Error));
                  }}
                />
              </label>
              <label>
                Evidence bytes
                <textarea
                  value={bytes}
                  onChange={(event) => setBytes(event.target.value)}
                  rows={8}
                  required
                  maxLength={262144}
                />
              </label>
              <label>
                Expected SHA-256
                <input
                  value={digest}
                  onChange={(event) => setDigest(event.target.value)}
                  required
                  pattern="[a-f0-9]{64}"
                  maxLength={64}
                />
              </label>
              <button className="button" type="submit" disabled={submit.isPending}>
                {submit.isPending ? 'Validating…' : 'Validate and save draft'}
              </button>
            </form>
            {submit.isError ? <ErrorPanel error={submit.error} /> : null}
            {localError ? <ErrorPanel error={localError} /> : null}
            {submit.isSuccess ? (
              <p role="status">Draft saved. Select it to inspect and review.</p>
            ) : null}
          </details>
        </section>
        <section className="exchange-detail" aria-label="Selected evidence">
          {!selected ? (
            <Empty title="Select evidence to inspect its claims">
              See cited sources, qualified recommendations and revision history before admission or
              export.
            </Empty>
          ) : null}
          {detail.isPending && selected ? <Loading /> : null}
          {detail.isError ? <ErrorPanel error={detail.error} /> : null}
          {bundle && selected ? (
            <>
              <div className="card-topline">
                <StateBadge state={selected.admittedId ? 'admitted' : 'draft'} />
                <span>{bundle.mode}</span>
              </div>
              <h2>{bundle.need.query}</h2>
              {selected.admittedId ? (
                <div className="exchange-actions">
                  <button
                    className="button"
                    type="button"
                    onClick={() => download(`${bundle.bundle_id}.json`, detail.data!.bytes)}
                  >
                    Export exact JSON
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() =>
                      download(`${bundle.bundle_id}.json.sha256`, detail.data!.digest + '\n')
                    }
                  >
                    Download SHA-256
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => {
                      void reassess().catch((error) => setLocalError(error as Error));
                    }}
                  >
                    Start reassessment
                  </button>
                </div>
              ) : null}
              <p className="exchange-meta">
                Produced {formatDate(bundle.created_at)} · {bundle.producer.protocol}
              </p>
              {selected.actor ? (
                <p>
                  Review: {selected.actor}. {selected.rationale}
                </p>
              ) : null}
              <h3>Useful options</h3>
              <div className="exchange-options">
                {bundle.candidates.map((candidate) => (
                  <article key={candidate.id}>
                    <div className="card-topline">
                      <StateBadge state={candidate.disposition} />
                      <span>
                        Producer confidence: {candidate.signal?.evidence_confidence ?? 'unknown'}
                      </span>
                    </div>
                    <h4>
                      <a href={candidate.canonical_uri} target="_blank" rel="noreferrer">
                        {candidate.name}
                      </a>
                    </h4>
                    <p>{candidate.reason}</p>
                    <ul>
                      {candidate.claim_ids.map((id) => {
                        const claim = bundle.claims.find((c) => c.id === id)!;
                        return (
                          <li key={id}>
                            <span className="claim-status">{claim.status}</span> {claim.text}
                            <div className="claim-sources">
                              {claim.source_ids.map((sourceId) => {
                                const source = bundle.sources.find((s) => s.id === sourceId)!;
                                return (
                                  <a
                                    key={sourceId}
                                    href={source.uri}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {source.title}
                                  </a>
                                );
                              })}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    {candidate.limitations.length ? (
                      <p className="exchange-limits">{candidate.limitations.join(' ')}</p>
                    ) : null}
                  </article>
                ))}
              </div>
              <h3>Coverage and limitations</h3>
              <ul>
                {bundle.limitations.map((limitation, i) => (
                  <li key={i}>{limitation}</li>
                ))}
              </ul>
              <details>
                <summary>Source revisions and lineage</summary>
                <ul>
                  {bundle.sources.map((source) => (
                    <li key={source.id}>
                      <a href={source.uri} target="_blank" rel="noreferrer">
                        {source.title}
                      </a>{' '}
                      · {source.source_class} · {formatDate(source.observed_at)}
                      <small className="source-revision">
                        {source.revision ?? 'Revision unknown'} ·{' '}
                        {source.independence_group ?? 'Lineage unknown'}
                      </small>
                    </li>
                  ))}
                </ul>
              </details>
              {detail.data?.changes?.length ? (
                <>
                  <h3>What consumers may reconsider</h3>
                  <ul>
                    {detail.data.changes.map((change, i) => (
                      <li key={i}>{change}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              {selected.admittedId ? (
                <>
                  <AdoptionAssessment
                    key={selected.admittedId}
                    id={selected.admittedId}
                    bundle={bundle}
                  />
                  <details>
                    <summary>Record consumer feedback</summary>
                    <p>
                      Feedback is local observed evidence tied to this revision. It does not
                      independently endorse the upstream source.
                    </p>
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        const data = new FormData(event.currentTarget);
                        feedback.mutate({
                          candidateId: formString(data, 'candidateId'),
                          consumerTask: formString(data, 'consumerTask'),
                          actionScope: formString(data, 'actionScope'),
                          outcome: formString(data, 'outcome'),
                          detail: formString(data, 'detail'),
                        });
                      }}
                    >
                      <label>
                        Option
                        <select name="candidateId">
                          {bundle.candidates.map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>
                              {candidate.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Consumer task
                        <input name="consumerTask" required maxLength={240} />
                      </label>
                      <label>
                        Action observed
                        <select name="actionScope">
                          <option value="reference">Attributed reference</option>
                          <option value="documented_use">Documented practice</option>
                          <option value="use">Use the interface</option>
                          <option value="copy">Copy source</option>
                          <option value="production">Production deployment</option>
                          <option value="comparison">Comparative assessment</option>
                        </select>
                      </label>
                      <label>
                        Outcome
                        <select name="outcome">
                          <option value="useful">Useful</option>
                          <option value="failed">Failed</option>
                          <option value="regressed">Regressed</option>
                          <option value="not_used">Not used</option>
                        </select>
                      </label>
                      <label>
                        Observed result
                        <textarea name="detail" required maxLength={2000} />
                      </label>
                      <button className="button" disabled={feedback.isPending}>
                        Save feedback
                      </button>
                    </form>
                    {feedback.isSuccess ? (
                      <p role="status">Feedback recorded for this evidence revision.</p>
                    ) : null}
                    {feedback.isError ? <ErrorPanel error={feedback.error} /> : null}
                  </details>
                </>
              ) : (
                <form
                  className="exchange-review"
                  onSubmit={(event) => {
                    event.preventDefault();
                    review.mutate();
                  }}
                >
                  <h3>Review and admit to Corpus</h3>
                  <p>
                    Confirm source support, scope, rights and unresolved blockers. Recommendations
                    grant no installation authority.
                  </p>
                  <label>
                    Review rationale
                    <textarea
                      required
                      value={rationale}
                      onChange={(event) => setRationale(event.target.value)}
                      maxLength={2000}
                    />
                  </label>
                  <label>
                    Supersedes admitted bundle ID (optional)
                    <input
                      value={predecessorId}
                      onChange={(event) => setPredecessorId(event.target.value)}
                    />
                  </label>
                  <label className="check-label">
                    <input type="checkbox" required />I reviewed these claims and found no
                    unresolved critical blocker for their stated scope.
                  </label>
                  <button className="button" disabled={review.isPending}>
                    {review.isPending ? 'Admitting…' : 'Admit reviewed evidence'}
                  </button>
                  {review.isError ? <ErrorPanel error={review.error} /> : null}
                </form>
              )}
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
