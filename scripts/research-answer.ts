import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  planResearchRetention,
  retainResearchAnswer,
  rediscoverResearch,
  compareResearchAnswers,
  type ResearchAnswer,
} from '../packages/corpus/src/research-answer.js';

const { values } = parseArgs({
  options: {
    query: { type: 'string' },
    'answer-file': { type: 'string' },
    'observed-at': { type: 'string' },
    select: { type: 'string', multiple: true },
    retain: { type: 'boolean' },
    root: { type: 'string' },
    rediscover: { type: 'string' },
    'compare-answer-file': { type: 'string' },
  },
  strict: true,
});
const root = resolve(values.root ?? process.cwd());
if (values.rediscover) {
  process.stdout.write(
    JSON.stringify(await rediscoverResearch(root, values.rediscover), null, 2) + '\n',
  );
} else {
  if (!values.query || !values['answer-file'] || !values['observed-at'])
    throw new Error('query_answer_file_and_original_observation_time_required');
  if (values.select?.length && !values.retain)
    throw new Error('explicit_retain_required_for_selection');
  const input: ResearchAnswer = {
    query: values.query,
    answer: await readFile(values['answer-file'], 'utf8'),
    observedAt: values['observed-at'],
    provenance: { receipt: values['answer-file'], requestedModel: null, servedModel: null },
  };
  const result = values.retain
    ? await retainResearchAnswer(root, input, values.select ?? [])
    : planResearchRetention(input);
  const comparison = values['compare-answer-file']
    ? compareResearchAnswers(input, {
        ...input,
        answer: await readFile(values['compare-answer-file'], 'utf8'),
      })
    : undefined;
  process.stdout.write(JSON.stringify({ result, comparison }, null, 2) + '\n');
}
