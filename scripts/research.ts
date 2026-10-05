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
  if (operation === 'context')
    console.log(
      JSON.stringify(
        {
          result,
          options: options.slice(0, 48),
          next: 'Use the Signals research skill: interpret, fetch permitted primary evidence, draft findings, independent second review, then admit only high-signal public findings. Users supply questions, never review artifacts.',
        },
        null,
        2,
      ),
    );
  else {
    const saved = await saveQuery(result);
    console.log(JSON.stringify({ ...result, saved }, null, 2));
  }
} else
  throw new Error(
    'research query QUESTION [--model] | context QUESTION | admit DRAFT.json TYPE | history SNAPSHOT DATABASE TABLE',
  );
