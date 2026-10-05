import { mkdtemp, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { evidenceDigest } from '../../domain/src/evidence-exchange.js';
import { claimFreshness, filterPublicOptions } from '../../domain/src/public-corpus.js';
import { loadPublicCorpus } from './public-corpus.js';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function copyRecord(change: (bundle: Record<string, unknown>) => void = () => {}) {
  const root = await mkdtemp(join(tmpdir(), 'signals-public-test-'));
  directories.push(root);
  const corpus = await loadPublicCorpus();
  const record = corpus.bundles[0]!;
  const bundle = JSON.parse(record.bytes);
  change(bundle);
  const bytes = JSON.stringify(bundle);
  const admission = { ...record.admission, digest: evidenceDigest(bytes) };
  await writeFile(join(root, admission.file), bytes);
  await writeFile(join(root, `${admission.file}.sha256`), `${admission.digest}\n`);
  await writeFile(
    join(root, 'manifest.json'),
    JSON.stringify({ schemaVersion: 1, admissions: [admission] }),
  );
  return { root, admission, bundle };
}

it('finds real reviewed options using combined exact filters and literal text', async () => {
  const { options } = await loadPublicCorpus();
  expect(
    filterPublicOptions(options, {
      query: 'water meter',
      category: 'Household',
      sourceClass: 'guidance',
    }).map((o) => o.id),
  ).toEqual(['option-water-leaks']);
  expect(filterPublicOptions(options, { query: 'water', category: 'Writing' })).toEqual([]);
  expect(filterPublicOptions(options, { concept: 'data.lineage' }).map((o) => o.id)).toEqual([
    'option-source-lineage',
  ]);
  expect(filterPublicOptions(options, { githubOnly: true })).toEqual([]);
});

it('rejects private metadata, fixture promotion, ambiguous identities and incomplete review', async () => {
  for (const change of [
    (b: Record<string, unknown>) => {
      b.extensions = { 'local.notes': 'Private context that no regex recognizes' };
    },
    (b: Record<string, unknown>) => {
      b.mode = 'fixture';
    },
  ]) {
    const { root } = await copyRecord(change);
    await expect(loadPublicCorpus(root)).rejects.toThrow();
  }
  const { root, admission } = await copyRecord();
  await writeFile(
    join(root, 'manifest.json'),
    JSON.stringify({ schemaVersion: 1, admissions: [{ ...admission, claimReviews: [] }] }),
  );
  await expect(loadPublicCorpus(root)).rejects.toThrow('freshness assessment');
  await writeFile(
    join(root, 'manifest.json'),
    JSON.stringify({ schemaVersion: 1, admissions: [admission, admission] }),
  );
  await expect(loadPublicCorpus(root)).rejects.toThrow('Duplicate');
});

it('rejects interrupted or tampered bytes and file paths escaping the reviewed directory', async () => {
  const { root, admission } = await copyRecord();
  const file = join(root, admission.file);
  await writeFile(file, (await readFile(file, 'utf8')).slice(0, -4));
  await expect(loadPublicCorpus(root)).rejects.toThrow('digest mismatch');
  await rm(file);
  const outside = await mkdtemp(join(tmpdir(), 'signals-public-outside-'));
  directories.push(outside);
  await writeFile(join(outside, 'record.json'), '{}');
  await symlink(join(outside, 'record.json'), file);
  await expect(loadPublicCorpus(root)).rejects.toThrow('escapes Corpus');
});

it('keeps freshness tied to source observation and claim volatility', async () => {
  const { bundles } = await loadPublicCorpus();
  const { bundle } = bundles[0]!;
  const claim = bundle.claims[0]!;
  const sources = bundle.sources.map((s) => ({ ...s, observed_at: '2020-01-01T00:00:00Z' }));
  expect(
    claimFreshness(
      claim,
      sources,
      { claimId: claim.id, basis: 'stable', reviewAfterDays: null },
      '2026-10-05T21:00:00Z',
    ),
  ).toBe('current');
  expect(
    claimFreshness(
      claim,
      sources,
      { claimId: claim.id, basis: 'volatile', reviewAfterDays: 30 },
      '2026-10-05T21:00:00Z',
    ),
  ).toBe('due');
  expect(
    claimFreshness(
      claim,
      sources.map((s) => ({ ...s, observed_at: null })),
      { claimId: claim.id, basis: 'stable', reviewAfterDays: null },
      '2026-10-05T21:00:00Z',
    ),
  ).toBe('unknown');
});
