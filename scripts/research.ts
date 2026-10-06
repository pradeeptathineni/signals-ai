import { readFile } from 'node:fs/promises';
import { loadPublicCorpus } from '../packages/corpus/src/public-corpus.js';
import { researchQuery } from '../packages/domain/src/research-query.js';
import { localStructuredModel } from '../packages/corpus/src/local-model.js';
import {
  admitRecord,
  readRetainedTable,
  saveQuery,
} from '../packages/corpus/src/research-store.js';
import { reviewDraft, type SourceMaterial } from '../packages/corpus/src/review-draft.js';
import { signalSearch } from '../packages/corpus/src/signal-search.js';
import { searchEvidenceBundle } from '../packages/corpus/src/search-exchange.js';
import { execFileSync } from 'node:child_process';

const [operation, ...args] = process.argv.slice(2);
if (operation === 'curate') {
  if (args.length !== 3)
    throw new Error('Agent curation: curate DRAFT.json SOURCE_MATERIAL.json TYPE');
  const model = localStructuredModel(
    process.env.SIGNALS_MODEL_ENDPOINT ?? '',
    process.env.SIGNALS_MODEL_ID ?? '',
  );
  const material = JSON.parse(await readFile(args[1]!, 'utf8')) as SourceMaterial[];
  const reviewed = await reviewDraft(await readFile(args[0]!, 'utf8'), material, model);
  console.log(await admitRecord(reviewed, args[2]!));
} else if (operation === 'admit') {
  if (args.length !== 2) throw new Error('Agent admission: admit DRAFT.json TYPE');
  console.log(await admitRecord(await readFile(args[0]!, 'utf8'), args[1]!));
} else if (operation === 'history') {
  if (args.length !== 3) throw new Error('history CONTAINER_SNAPSHOT DATABASE TABLE');
  console.log(JSON.stringify(await readRetainedTable(args[0]!, args[1]!, args[2]!), null, 2));
} else if (['query', 'context'].includes(operation ?? '')) {
  const result = await signalSearch(
    { query: args.join(' '), save: 'never', cache: 'memory' },
    { progress: (event) => process.stderr.write(`${event}\n`) },
  );
  console.log(
    JSON.stringify(
      operation === 'context'
        ? searchEvidenceBundle(
            result,
            execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
          )
        : result,
      null,
      2,
    ),
  );
  if (['failed', 'not_configured'].includes(result.status)) process.exitCode = 1;
} else if (operation === 'corpus-query') {
  const question = args.filter((arg) => arg !== '--model').join(' ');
  const options = (await loadPublicCorpus()).options;
  let model;
  if (args.includes('--model')) {
    try {
      model = localStructuredModel(
        process.env.SIGNALS_MODEL_ENDPOINT ?? '',
        process.env.SIGNALS_MODEL_ID ?? '',
      );
    } catch {
      model = {
        propose: () => Promise.reject(new Error('No valid explicit loopback model configuration.')),
      };
    }
  }
  const result = await researchQuery(options, question, {}, model);
  {
    const saved = await saveQuery(result);
    console.log(JSON.stringify({ ...result, saved }, null, 2));
  }
} else
  throw new Error(
    'research query/context QUESTION | corpus-query QUESTION [--model] | admit DRAFT.json TYPE | history SNAPSHOT DATABASE TABLE',
  );
