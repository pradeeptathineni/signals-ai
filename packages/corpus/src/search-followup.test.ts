import { expect, it } from 'vitest';
import { frozenFollowupMaterial } from './search-followup.js';
import type { SearchResult } from '../../domain/src/search-contract.js';

const result = {
  brief: { format: 'markdown', text: 'Retained hypothetical exercise; it was not executed.' },
  gaps: ['Runtime not tested.', 'excluded resource access was denied.'],
  items: ['selected', 'excluded'].map((id) => ({
    entity: {
      id,
      name: id,
      uri: `https://example.org/${id}`,
      description: `${id} description`,
      facets: { capabilities: ['inspectable learning'] },
      limits: [`${id} unexecuted`],
      evidence: [],
      observations: [],
      assessment: { policy: 'signal-strength-v6' },
    },
  })),
} as unknown as SearchResult;

it('keeps prior hypothetical synthesis distinct from verified observations', () => {
  const frozen = frozenFollowupMaterial(result, []);
  expect(frozen.priorSynthesis).toContain('it was not executed');
  expect(frozen.material).toEqual([]);
  expect(frozen.gaps).toEqual(result.gaps);
});

it('never adds unselected records or their prior synthesis to a scoped follow-up', () => {
  const frozen = frozenFollowupMaterial(result, ['selected']);
  expect(frozen.priorSynthesis).toBeUndefined();
  expect(JSON.stringify(frozen)).not.toContain('excluded');
  expect(frozen.context[0]?.limits).toEqual(['selected unexecuted']);
});
