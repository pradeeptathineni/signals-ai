import type { ClaimReceipt } from '../../../packages/domain/src/claim-check.js';

export function ClaimCheck({ receipt }: { receipt: ClaimReceipt }) {
  return (
    <section aria-label="Selected proposition check">
      <h2>Selected proposition</h2>
      <p>
        {receipt.version === 3
          ? 'Explicit check from retained incomplete notes. The original prose remains unassessed; this is not a completed-answer assessment.'
          : receipt.version === 2
            ? 'User-specified proposition and primary sources, without an original research answer.'
            : 'User-specified proposition; it need not be asserted by the original answer.'}
      </p>
      <p>
        The snapshot preserves supplied normalized text. Extraction may omit original structure,
        terms or conditions; complete normalization does not mean complete source coverage.
      </p>
      <p>{receipt.claimText}</p>
      <p>
        Review: {receipt.reviewState}. Verdict: {receipt.verdict ?? 'Not available'}. Confidence
        Unknown. No numeric Signal.
      </p>
      <p>
        {receipt.historySaved
          ? receipt.version === 3
            ? 'Saved privately with a copy of the incomplete notes and primary snapshots. Original-run expiry or deletion does not delete this separate copy.'
            : receipt.version === 2
              ? 'Saved privately with the original request and primary snapshots.'
              : 'Saved privately with the original answer link.'
          : 'Not saved to history.'}
      </p>
      <p>{receipt.reason}</p>
      <p>Next check: {receipt.nextCheck}</p>
      <details>
        <summary>Original need and context</summary>
        <p>{receipt.originalNeed}</p>
        <p>{receipt.originalContext}</p>
        {receipt.additionalContext && <p>Additional context: {receipt.additionalContext}</p>}
      </details>
      {receipt.version === 3 && (
        <details>
          <summary>Copied incomplete notes</summary>
          <p>
            Unassessed original prose. Original context was not retained. This copy does not restore
            its original run or renew source dates.
          </p>
          <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {receipt.origin.fullBrief}
          </pre>
        </details>
      )}
      <ol>
        {receipt.selectedMaterial.map((source) => (
          <li key={source.sourceIndex}>
            <a href={source.requestedUri} target="_blank" rel="noreferrer">
              Selected source {source.sourceIndex + 1}
            </a>
            : {source.state}.
            {source.state === 'usable' ? (
              <>
                <p>
                  Scope: {source.scope}. Acquired {source.fetchedAt}; publication{' '}
                  {source.publishedAt ?? 'Unknown'}. Final identity: {source.finalUri}
                </p>
                <ul>
                  {source.omissions.map((omission, index) => (
                    <li key={index}>{omission}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p>{source.reason}</p>
            )}
          </li>
        ))}
      </ol>
      {receipt.findings.map((finding, index) => {
        const source = receipt.selectedMaterial[finding.sourceIndex];
        const text = source?.state === 'usable' ? source.text.replace(/\s+/g, ' ').trim() : '';
        const quote = finding.quote.replace(/\s+/g, ' ').trim();
        const position = text.indexOf(quote);
        return (
          <article key={index}>
            <p>
              {receipt.reviewState === 'completed' ? 'Native finding' : 'Unaccepted native finding'}
              : {finding.status}; source {finding.sourceIndex + 1}.
            </p>
            <blockquote>{finding.quote}</blockquote>
            <p>{finding.reason}</p>
            {position >= 0 && (
              <details>
                <summary>Primary passage context</summary>
                <p>{text.slice(Math.max(0, position - 160), position + quote.length + 160)}</p>
              </details>
            )}
          </article>
        );
      })}
      <ul>
        {receipt.gaps.map((gap, index) => (
          <li key={index}>
            {gap.decisive ? 'Decisive gap: ' : ''}
            {gap.reason}
          </li>
        ))}
      </ul>
      {receipt.rejectedOutput && (
        <p>
          Native output was rejected;{' '}
          {receipt.rejectedOutput.captureScope === 'runner-stdout'
            ? 'received stdout byte counts and a digest remain, with unclassified text omitted.'
            : 'a bounded private reply diagnostic remains.'}{' '}
          {receipt.rejectedOutput.omittedBytes} captured bytes omitted. Capture{' '}
          {receipt.rejectedOutput.captureComplete ? 'complete' : 'incomplete'}.
        </p>
      )}
      <p>
        Matching primary text establishes occurrence; entailment, completeness and independence
        remain fallible judgments.
      </p>
    </section>
  );
}
