import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ClaimCheck } from './claim-check.js';
import type { ClaimReceipt } from '../../../packages/domain/src/claim-check.js';
it('shows denial, Unknown, memory authority and original scope without inventing a verdict', () => {
  const receipt: ClaimReceipt = {
    version: 1,
    claimText: 'Metadata does not establish object rights.',
    claimDigest: 'a'.repeat(64),
    parentRunId: '00000000-0000-0000-0000-000000000000',
    parentAnswerDigest: 'b'.repeat(64),
    originalNeed: 'Full original need; never upload originals.',
    originalContext: 'Application uncertain.',
    selectedMaterial: [
      {
        sourceIndex: 0,
        requestedUri: 'https://example.org/policy',
        state: 'denied',
        reason: 'source_denied_403',
      },
    ],
    reviewState: 'not-reviewed',
    verdict: null,
    reason: 'No primary material reviewed.',
    nextCheck: 'Inspect public primary material.',
    findings: [],
    gaps: [{ reason: 'Acquisition denied; permission remains unresolved.', decisive: true }],
    confidence: 'Unknown',
    historySaved: false,
    stages: { acquisitionMs: 2, nativeMs: 0, validationMs: 0 },
    abortOrigin: null,
  };
  const html = renderToStaticMarkup(<ClaimCheck receipt={receipt} />);
  for (const value of [
    'Confidence Unknown',
    'Not saved to history',
    'not-reviewed',
    'Not available',
    'source_denied_403',
    'never upload originals',
    'permission remains unresolved',
    'No numeric Signal',
  ])
    expect(html).toContain(value);
});
