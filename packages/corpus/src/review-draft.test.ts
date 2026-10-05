import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { reviewDraft } from './review-draft.js';
import { readPublicRecord } from './public-record.js';

it('binds fresh independent model judgment to supplied evidence rather than creator confidence', async () => {
  const raw = await readFile('signals/practices/water-leaks.json', 'utf8');
  const { bundle, admission } = await readPublicRecord(raw, 'water.json');
  let calls = 0;
  const quality = JSON.parse(raw).review.quality;
  const next = await reviewDraft(
    raw,
    bundle.sources.map((s) => ({
      sourceId: s.id,
      observedAt: s.observed_at!,
      text: 'Synthetic source snapshot for contract verification, not research evidence.',
    })),
    {
      propose: () => {
        calls++;
        return Promise.resolve({ options: quality.options });
      },
    },
  );
  const value = JSON.parse(next);
  expect(value.review.quality.evidenceDigest).toBe(admission.digest);
  expect(value.review.quality.reviewRunId).not.toBe(value.review.quality.researchRunId);
  expect(calls).toBe(1);
  await expect(
    reviewDraft(raw, [], { propose: () => Promise.reject(new Error('must not run')) }),
  ).rejects.toThrow('Every primary source');
});
