import { useEffect, useRef, type ReactNode } from 'react';
import type { LibraryFinding } from '../../../packages/domain/src/library-search.js';

const date = (value: string | null) =>
  value
    ? new Date(value).toLocaleString('en-US', {
        timeZone: 'UTC',
        dateStyle: 'medium',
        timeStyle: 'short',
      }) + ' UTC'
    : 'Unknown';

export function ScoreView({ score, label }: { score: number | null; label: string }) {
  return (
    <span className="desk-score">
      <strong>{score ?? '—'}</strong>
      <span>{label}</span>
    </span>
  );
}

/** Presentation only: intrinsic assessment remains distinct from retrieval and contextual fit. */
export function CandidateSummary({ finding }: { finding: LibraryFinding }) {
  return (
    <>
      <div className="desk-finding-head">
        <h3>{finding.title}</h3>
        <span className="desk-kind">{finding.kind.replaceAll('_', ' ')}</span>
      </div>
      <p className="desk-summary">{finding.description}</p>
      <div className="desk-scoreline">
        <ScoreView
          score={finding.intrinsicStrength.score}
          label={finding.origin.format === 'legacy' ? 'Review' : 'Signal'}
        />
        {finding.intrinsicStrength.score === null && (
          <span className="desk-assessment-state">Not scored</span>
        )}
        {finding.native?.assessment.disposition === 'provisional' && (
          <span className="desk-assessment-state">Provisional</span>
        )}
        <span className="desk-origin">
          {finding.origin.destination === 'private' ? 'Private finding' : 'Public finding'}
        </span>
      </div>
    </>
  );
}

export function ComparisonView({
  findings,
  onClear,
  children,
}: {
  findings: LibraryFinding[];
  onClear: () => void;
  children?: ReactNode;
}) {
  return (
    <section className="desk-comparison" aria-label="Compare selected findings">
      <div className="desk-section-line">
        <h2>Compare</h2>
        <button onClick={onClear}>Clear comparison</button>
      </div>
      <div>
        {findings.map((finding) => (
          <article key={finding.key}>
            <h3>{finding.title}</h3>
            <p className="desk-summary">{finding.description}</p>
            <ScoreView
              score={finding.intrinsicStrength.score}
              label={finding.origin.format === 'legacy' ? 'Review' : 'Signal'}
            />
            <p className="desk-limit">
              {finding.native?.limits[0] ?? finding.lead?.limits[0] ?? 'Limits not recorded.'}
            </p>
          </article>
        ))}
      </div>
      <details>
        <summary>Score basis</summary>
        <p>Different policies and type rubrics are not directly comparable.</p>
        {findings.map((finding) => (
          <p key={finding.key}>
            {finding.title}: {finding.intrinsicStrength.policy} ·{' '}
            {finding.native?.assessment.rubric ?? finding.kind} ·{' '}
            {finding.native?.assessment.disposition ??
              finding.native?.assessment.state ??
              'Historical review'}
          </p>
        ))}
      </details>
      {children}
    </section>
  );
}

export type FrozenAnswer = {
  answer: string;
  statements: {
    statement: string;
    quote: string;
    entityId: string;
    evidenceId: string;
    observationId: string;
  }[];
};
export function FrozenDiscussion({
  question,
  busy,
  answer,
  onQuestion,
  onSubmit,
}: {
  question: string;
  busy: boolean;
  answer: FrozenAnswer | null;
  onQuestion: (question: string) => void;
  onSubmit: () => void;
}) {
  return (
    <details
      aria-label="Selected evidence discussion"
      open={busy || Boolean(answer) || Boolean(question)}
    >
      <summary>Ask about these items</summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <label>
          Ask selected retained evidence
          <input required value={question} onChange={(event) => onQuestion(event.target.value)} />
        </label>
        <button disabled={busy}>
          {busy ? 'Reading retained evidence…' : 'Explain from retained evidence'}
        </button>
        <small>AI reads selected evidence only. No new web research.</small>
      </form>
      {answer && (
        <section aria-label="Retained evidence answer">
          <p>{answer.answer}</p>
          {answer.statements.map((statement) => (
            <details key={statement.entityId + ':' + statement.observationId}>
              <summary>{statement.statement}</summary>
              <blockquote>{statement.quote}</blockquote>
              <p className="desk-meta">
                Record: {statement.entityId} · evidence: {statement.evidenceId} · observation:{' '}
                {statement.observationId}
              </p>
            </details>
          ))}
        </section>
      )}
    </details>
  );
}

/** A nonmodal evidence region keeps the result list and selection in place. */
export function EvidencePanel({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [title]);
  return (
    <section
      className="desk-evidence-panel"
      aria-label="Evidence panel"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header>
        <h2 ref={heading} tabIndex={-1}>
          {title}
        </h2>
        <button type="button" aria-label="Close evidence" onClick={onClose}>
          Close
        </button>
      </header>
      {children}
    </section>
  );
}

type Recent = { runId: string; query: string; status: string; candidates: number };
type Interest = { id: string; query: string; enabled: boolean };
type Selection = {
  query: string;
  queryId?: string;
  at: string;
  selected: string[];
  destination?: string;
};

/** Home uses actual retained provenance. Opening it never starts acquisition or recurrence. */
export function HomeOverview({
  records,
  interests,
  recent,
  selections,
  openLibrary,
  openFollowing,
  inspect,
  reopen,
}: {
  records: LibraryFinding[];
  interests: Interest[];
  recent: Recent[];
  selections: Selection[];
  openLibrary: () => void;
  openFollowing: () => void;
  inspect: (key: string) => void;
  reopen: (run: Recent) => void;
}) {
  const followed = selections.filter((selection) =>
    interests.some(
      (interest) => selection.queryId === interest.id || selection.query === interest.query,
    ),
  );
  const discoveries = records
    .flatMap((finding) => {
      const selection = followed.find(
        (selection) =>
          selection.selected.includes(finding.id) &&
          selection.destination === finding.origin.destination,
      );
      return selection ? [{ finding, selection }] : [];
    })
    .slice(0, 6);
  return (
    <div className="desk-home">
      <section aria-label="Followed interest discoveries">
        <div className="desk-section-line">
          <h2>From your interests</h2>
          <button onClick={openFollowing}>Following</button>
        </div>
        {discoveries.map(({ finding, selection }) => (
          <article className="desk-finding" key={finding.key}>
            <CandidateSummary finding={finding} />
            <p className="desk-meta">
              Source observed{' '}
              {date(
                finding.native?.evidence
                  .filter((source) => source.state === 'fetched')
                  .map((source) => source.fetchedAt)
                  .sort()
                  .at(-1) ?? null,
              )}{' '}
              ·{' '}
              {[...(finding.native?.evidence ?? [])]
                .filter((source) => source.state === 'fetched')
                .sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt))[0]?.publisher ??
                'No retained source observation'}
            </p>
            <div className="desk-actions">
              <button onClick={() => inspect(finding.key)}>Evidence</button>
              <details>
                <summary>Saved context</summary>
                <p>
                  Retained from “{selection.query}” · saved {date(selection.at)}
                </p>
              </details>
            </div>
          </article>
        ))}
        {!discoveries.length && (
          <div className="desk-home-empty">
            <h3>{interests.length ? 'No discoveries saved yet.' : 'Follow what interests you.'}</h3>
            <p>
              {interests.length
                ? 'Search a topic to get started.'
                : 'Choose a topic. Discover something new.'}
            </p>
            <button onClick={openFollowing}>
              {interests.length ? 'View followed interests' : 'Choose an interest'}
            </button>
          </div>
        )}
      </section>
      <div className="desk-home-secondary">
        <section aria-label="Library shortcut">
          <h2>Your Library</h2>
          <p>{records.filter((finding) => finding.saved).length} saved findings</p>
          <button onClick={openLibrary}>Browse Library</button>
        </section>
        <section aria-label="Recent searches">
          <h2>Recent searches</h2>
          {recent.slice(0, 5).map((run) => (
            <button className="desk-recent" key={run.runId} onClick={() => reopen(run)}>
              <strong>{run.query}</strong>
              <span>
                {run.candidates} candidates · {run.status} · retained
              </span>
            </button>
          ))}
          {!recent.length && <p>No saved searches yet.</p>}
        </section>
      </div>
    </div>
  );
}
