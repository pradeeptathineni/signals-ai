import { publishPublicData } from '../packages/corpus/src/public-export.js';
import { loadPublicCorpus } from '../packages/corpus/src/public-corpus.js';
import { filterPublicOptions, type PublicFilters } from '../packages/domain/src/public-corpus.js';
import { readFile } from 'node:fs/promises';
import { encodePublicEvidence } from '../packages/corpus/src/public-record.js';
import {
  evidenceDigest,
  parseEvidenceBundle,
  requireUniqueJsonKeys,
} from '../packages/domain/src/evidence-exchange.js';

const [operation, ...args] = process.argv.slice(2);
if (operation === 'digest') {
  if (args.length !== 1) throw new Error('Usage: corpus digest FILE.json');
  const raw = await readFile(args[0]!, 'utf8');
  requireUniqueJsonKeys(raw);
  const record = JSON.parse(raw) as { evidence: unknown; encoding: string };
  const bytes = await encodePublicEvidence(record.evidence, record.encoding);
  const digest = evidenceDigest(bytes);
  parseEvidenceBundle(bytes, digest);
  process.stdout.write(`${digest}\n`);
  process.exit(0);
}
const corpus = await loadPublicCorpus();
if (operation === 'check') {
  process.stdout.write(
    `${corpus.bundles.length} reviewed bundles; ${corpus.options.length} public options.\n`,
  );
} else if (operation === 'search') {
  const filters: PublicFilters = {};
  const allowed = new Set([
    'query',
    'textMode',
    'type',
    'category',
    'concept',
    'sourceClass',
    'freshness',
    'disposition',
  ]);
  for (const argument of args) {
    if (argument.startsWith('--domain=')) {
      filters.category = argument.slice(9);
      continue;
    }
    if (argument.startsWith('--tag=')) {
      filters.concept = argument.slice(6);
      continue;
    }
    const match = /^--([a-zA-Z]+)=(.*)$/.exec(argument);
    if (match?.[1] === 'githubOnly' && ['true', 'false'].includes(match[2]!)) {
      filters.githubOnly = match[2] === 'true';
      continue;
    }
    if (!match || !allowed.has(match[1]!))
      throw new Error('Use --query=TEXT or a documented exact filter.');
    Object.assign(filters, { [match[1]!]: match[2]! });
  }
  if (filters.textMode && !['literal', 'ranked'].includes(filters.textMode))
    throw new Error('Text mode must be literal or ranked.');
  process.stdout.write(
    `${JSON.stringify({ universe: 'reviewed-public-files', filters, items: filterPublicOptions(corpus.options, filters) }, null, 2)}\n`,
  );
} else if (operation === 'build') {
  await publishPublicData(corpus);
} else throw new Error('Usage: corpus check | search --query=TEXT [--type=VALUE] | build');
