import { Type, type Static } from 'typebox';
import { Value } from 'typebox/value';
import { normalizeConsiderUrl } from './url.js';

const closed = { additionalProperties: false };
const shortText = (maxLength: number) => Type.String({ minLength: 1, maxLength });
const suggestionSchema = Type.Object(
  {
    claim: shortText(1600),
    basis: shortText(400),
    why: shortText(400),
    urls: Type.Array(shortText(2048), { minItems: 1, maxItems: 2, uniqueItems: true }),
  },
  closed,
);
export const suggestedAnswerSchema = Type.Object(
  {
    answer: shortText(24000),
    suggestions: Type.Array(suggestionSchema, { maxItems: 3 }),
  },
  closed,
);
const receiptSchema = Type.Object(
  {
    version: Type.Literal(1),
    state: Type.Literal('unverified'),
    answerDigest: Type.String({ pattern: '^[a-f0-9]{64}$' }),
    offeredDigest: Type.String({ pattern: '^[a-f0-9]{64}$' }),
    offered: suggestedAnswerSchema.properties.suggestions,
  },
  closed,
);
export type CheckSuggestions = Static<typeof receiptSchema>;
export const offeredPayload = (offered: CheckSuggestions['offered']) =>
  JSON.stringify(offered.map(({ claim, basis, why, urls }) => [claim, basis, why, urls]));
export const suggestionSelectionPayload = (
  parentRunId: string,
  answerDigest: string,
  offeredDigest: string,
  index: number,
) => JSON.stringify(['check-selection-v1', parentRunId, answerDigest, offeredDigest, index]);

/** Citation membership is a locator boundary, never evidence of a source's role or support. */
export function checkSuggestions(input: unknown, answerDigest: string, citations: string[]) {
  if (!Value.Check(receiptSchema, input) || input.answerDigest !== answerDigest)
    throw new Error('invalid_check_suggestions');
  for (const offered of input.offered) {
    if (![offered.claim, offered.basis, offered.why].every((text) => text.trim()))
      throw new Error('empty_check_suggestion');
    for (const uri of offered.urls) {
      const normalized = normalizeConsiderUrl(uri).normalizedUrl + new URL(uri).hash;
      if (normalized !== uri || !citations.includes(uri))
        throw new Error('check_suggestion_not_cited');
    }
  }
  return input;
}
