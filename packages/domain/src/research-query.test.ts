import { expect, it } from 'vitest';
import { loadPublicCorpus } from '../../corpus/src/public-corpus.js';
import { researchQuery, type StructuredModel } from './research-query.js';

it('preserves literal results on model failure and requires two separately bounded proposals', async () => {
  const options = (await loadPublicCorpus()).options;
  const failed = await researchQuery(
    options,
    'toilet dye',
    {},
    { propose: () => Promise.reject(new Error('offline')) },
  );
  expect(failed.mode).toBe('deterministic-fallback');
  expect(failed.items.map((o) => o.id)).toEqual(['option-water-leaks']);
  let calls = 0;
  const model: StructuredModel = {
    propose: () => {
      calls++;
      return Promise.resolve(
        calls === 1
          ? {
              summary: 'Use a meter check as a detection step.',
              items: [
                {
                  optionId: 'option-water-leaks',
                  reason: 'It provides the relevant meter check.',
                  claimIds: ['water-leaks-epa'],
                },
              ],
              gaps: ['It does not locate the leak.'],
            }
          : {
              approvedIds: ['option-water-leaks'],
              rationale: 'Supported detection advice within the stated limits.',
              gaps: [],
            },
      );
    },
  };
  const result = await researchQuery(
    options,
    'How can I detect a plumbing leak without buying monitoring equipment?',
    {},
    model,
  );
  expect(result.mode).toBe('model-assisted');
  expect(result.items.map((o) => o.id)).toEqual(['option-water-leaks']);
  expect(calls).toBe(2);
});

it('keeps word ranking separate from precise filtering and returns no matches for absent vocabulary', async () => {
  const options = (await loadPublicCorpus()).options;
  const question = 'How can I check a toilet for leaks?';
  const answer = await researchQuery(options, question, { category: 'Household' });
  expect(answer.literalIds).toEqual([]);
  expect(answer.items[0]?.id).toBe('option-water-leaks');
  expect(answer.items.every((option) => option.category === 'Household')).toBe(true);
  expect((await researchQuery(options, 'xylophonicquasar')).items).toEqual([]);
});
it('rejects evidence fabrication, filter escape and reviewer introductions', async () => {
  const options = (await loadPublicCorpus()).options;
  const result = await researchQuery(
    options,
    'water',
    { category: 'Photography' },
    {
      propose: () =>
        Promise.resolve({
          summary: 'Fake relevant recommendation.',
          items: [
            {
              optionId: 'option-water-leaks',
              reason: 'Ignores the exact domain filter.',
              claimIds: ['water-leaks-epa'],
            },
          ],
          gaps: [],
        }),
    },
  );
  expect(result.mode).toBe('deterministic-fallback');
  expect(result.items.map((o) => o.id)).not.toContain('option-water-leaks');
  let calls = 0;
  const review = await researchQuery(
    options,
    'water meter',
    {},
    {
      propose: () =>
        Promise.resolve(
          ++calls === 1
            ? {
                summary: 'Meter checks identify probable leakage.',
                items: [
                  {
                    optionId: 'option-water-leaks',
                    reason: 'The documented detection procedure.',
                    claimIds: ['water-leaks-epa'],
                  },
                ],
                gaps: [],
              }
            : {
                approvedIds: ['invented'],
                rationale: 'A made-up selection outside the first answer.',
                gaps: [],
              },
        ),
    },
  );
  expect(review.mode).toBe('deterministic-fallback');
});
it('removes unreviewed summaries when the second review rejects the proposed answer', async () => {
  const options = (await loadPublicCorpus()).options;
  let calls = 0;
  const result = await researchQuery(
    options,
    'water meter',
    {},
    {
      propose: () =>
        Promise.resolve(
          ++calls === 1
            ? {
                summary: 'A water meter always identifies the exact leak location.',
                items: [
                  {
                    optionId: 'option-water-leaks',
                    reason: 'A proposed interpretation.',
                    claimIds: ['water-leaks-epa'],
                  },
                ],
                gaps: [],
              }
            : {
                approvedIds: [],
                rationale: 'Detection does not locate the leak; the answer overclaims.',
                gaps: ['Location requires further investigation.'],
              },
        ),
    },
  );
  expect(result.items).toEqual([]);
  expect(result.summary).toContain('No option survived');
  expect(result.summary).not.toContain('always');
});
