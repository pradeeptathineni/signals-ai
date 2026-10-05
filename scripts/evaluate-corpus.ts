import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { loadPublicCorpus } from '../packages/corpus/src/public-corpus.js';
import { filterPublicOptions } from '../packages/domain/src/public-corpus.js';
const catalog = JSON.parse(await readFile('concepts.json', 'utf8')) as {
  schemaVersion: number;
  concepts: Array<{ id: string; label: string; definition: string; status: string }>;
};
if (
  catalog.schemaVersion !== 1 ||
  new Set(catalog.concepts.map((c) => c.id)).size !== catalog.concepts.length
)
  throw new Error('Invalid canonical concept catalog.');
const options = (await loadPublicCorpus()).options;
const cases = catalog.concepts
  .filter((c) => c.status === 'active')
  .map((concept) => {
    const query = `Which existing approach helps with ${concept.label}: ${concept.definition}`;
    const ids = filterPublicOptions(options, { query }).map((option) => option.id);
    const rankedIds = filterPublicOptions(options, { query, textMode: 'ranked' })
      .slice(0, 8)
      .map((option) => option.id);
    return {
      conceptId: concept.id,
      label: concept.label,
      query,
      literalIds: ids,
      rankedIds,
      disposition: ids.length
        ? 'literal-match-needs-relevance-review'
        : 'no-literal-match-needs-research',
    };
  });
const result = {
  policy: 'concept-query-evaluation-v1',
  concepts: cases.length,
  universe: options.map((option) => option.id),
  literalMatches: cases.filter((c) => c.literalIds.length).length,
  cases,
  limits: [
    'Literal matches are not graded relevance. Zero matches can mean vocabulary mismatch or a Corpus coverage gap. Separate model/source review is required; this is not a universal success benchmark.',
  ],
};
await mkdir('.signals/evaluations', { recursive: true });
await writeFile('.signals/evaluations/concepts.json', JSON.stringify(result, null, 2) + '\n', {
  mode: 0o600,
});
console.log(
  JSON.stringify({
    concepts: result.concepts,
    highSignalOptions: options.length,
    literalMatches: result.literalMatches,
    report: '.signals/evaluations/concepts.json',
    meaning: 'coverage/retrieval diagnostic, not a passing relevance grade',
  }),
);
