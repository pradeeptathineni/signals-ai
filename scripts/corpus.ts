import { mkdir, writeFile } from 'node:fs/promises';
import { loadPublicCorpus } from '../packages/seed/src/public-corpus.js';
import { filterPublicOptions, type PublicFilters } from '../packages/domain/src/public-corpus.js';

const [operation, ...args] = process.argv.slice(2);
const corpus = await loadPublicCorpus();
if (operation === 'check') {
  process.stdout.write(
    `${corpus.bundles.length} reviewed bundles; ${corpus.options.length} public options.\n`,
  );
} else if (operation === 'search') {
  const filters: PublicFilters = {};
  const allowed = new Set([
    'query',
    'category',
    'concept',
    'sourceClass',
    'freshness',
    'disposition',
  ]);
  for (const argument of args) {
    const match = /^--([a-zA-Z]+)=(.*)$/.exec(argument);
    if (!match || !allowed.has(match[1]!))
      throw new Error('Use --query=TEXT or a documented exact filter.');
    Object.assign(filters, { [match[1]!]: match[2]! });
  }
  process.stdout.write(
    `${JSON.stringify({ universe: 'reviewed-public-files', filters, items: filterPublicOptions(corpus.options, filters) }, null, 2)}\n`,
  );
} else if (operation === 'build') {
  // Validation completes before any output; a failed admission never produces a partial site.
  await mkdir('dist/public-data', { recursive: true });
  await writeFile('dist/public-data/corpus.json', `${JSON.stringify(corpus.options, null, 2)}\n`);
} else throw new Error('Usage: corpus check | search --query=TEXT [--category=VALUE] | build');
