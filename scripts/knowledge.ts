import { resolve } from 'node:path';
import {
  configureKnowledge,
  createTopic,
  exportTopic,
  knowledgeOwners,
  listTopics,
  openTopic,
  readKnowledge,
  searchKnowledge,
  updateTopic,
} from '../packages/corpus/src/knowledge.js';

const args = process.argv.slice(2);
let root = process.cwd();
if (args[0] === '--root') {
  args.shift();
  const selected = args.shift();
  if (!selected) throw new Error('explicit_root_required');
  root = resolve(selected);
}
const [command, value, patch] = args;
const parse = (text: string | undefined): unknown => JSON.parse(text ?? 'null');
try {
  let result: unknown;
  switch (command) {
    case 'owners':
      result = await knowledgeOwners(root);
      break;
    case 'configure':
      result = await configureKnowledge(root, { owners: parse(value) });
      break;
    case 'search':
      result = await searchKnowledge(root, value ?? '');
      break;
    case 'read':
      result = await readKnowledge(root, parse(value));
      break;
    case 'topics':
      result = await listTopics(root);
      break;
    case 'create':
      result = await createTopic(root, { name: value });
      break;
    case 'open':
      result = await openTopic(root, value ?? '');
      break;
    case 'update':
      result = await updateTopic(root, value ?? '', parse(patch));
      break;
    case 'export':
      console.log((await exportTopic(root, value ?? '')).content);
      process.exit(0);
      break;
    default:
      throw new Error(
        'Use owners|configure JSON|search TEXT|read JSON|topics|create NAME|open UUID|update UUID JSON|export UUID',
      );
  }
  console.log(JSON.stringify(result, null, 2));
} catch (failure) {
  console.error(
    JSON.stringify({ code: failure instanceof Error ? failure.message : 'knowledge_failed' }),
  );
  process.exitCode = 1;
}
