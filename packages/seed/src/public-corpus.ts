import { readFile, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { isAbsolute, relative, resolve } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { default as formats } from 'ajv-formats';
import { parseEvidenceBundle } from '../../domain/src/evidence-exchange.js';
import {
  projectPublicOptions,
  type PublicAdmission,
  type PublicOption,
} from '../../domain/src/public-corpus.js';

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'admissions'],
  properties: {
    schemaVersion: { const: 1 },
    admissions: {
      type: 'array',
      maxItems: 1000,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'file',
          'digest',
          'category',
          'reviewedAt',
          'reviewer',
          'rationale',
          'claimReviews',
        ],
        properties: {
          file: { type: 'string', pattern: '^[a-z0-9-]+\\.json$' },
          digest: { type: 'string', pattern: '^[a-f0-9]{64}$' },
          category: { type: 'string', minLength: 1, maxLength: 120 },
          reviewedAt: { type: 'string', format: 'date-time' },
          reviewer: { enum: ['human', 'agent-reviewed'] },
          rationale: { type: 'string', minLength: 1, maxLength: 2000 },
          claimReviews: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['claimId', 'basis', 'reviewAfterDays'],
              properties: {
                claimId: { type: 'string', minLength: 1 },
                basis: { enum: ['stable', 'volatile', 'unknown'] },
                reviewAfterDays: { type: ['integer', 'null'], minimum: 1, maximum: 3650 },
              },
            },
          },
        },
      },
    },
  },
};
const ajv = new Ajv2020({ allErrors: true, strict: true });
(formats as unknown as (instance: Ajv2020) => void)(ajv);
const validate = ajv.compile<{ schemaVersion: 1; admissions: PublicAdmission[] }>(schema);
const defaultRoot = fileURLToPath(new URL('../../../corpus/', import.meta.url));

export async function loadPublicCorpus(root = defaultRoot, asOf = new Date().toISOString()) {
  if (!Number.isFinite(Date.parse(asOf))) throw new Error('Invalid freshness evaluation date.');
  const manifest: unknown = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
  if (!validate(manifest)) throw new Error('Public admission manifest schema mismatch.');
  const rootPath = await realpath(root);
  const bundles = [];
  const options: PublicOption[] = [];
  const identities = new Set<string>();
  const files = new Set<string>();
  for (const admission of manifest.admissions) {
    if (files.has(admission.file)) throw new Error('Duplicate public admission.');
    files.add(admission.file);
    const path = await realpath(resolve(rootPath, admission.file));
    const inside = relative(rootPath, path);
    if (inside.startsWith('..') || isAbsolute(inside))
      throw new Error('Public record path escapes Corpus.');
    const bytes = await readFile(path, 'utf8');
    if ((await readFile(`${path}.sha256`, 'utf8')).trim() !== admission.digest)
      throw new Error('Public sidecar disagrees with the admission digest.');
    const bundle = parseEvidenceBundle(bytes, admission.digest);
    if (!/^[a-zA-Z0-9-]+$/.test(bundle.bundle_id)) throw new Error('Unsafe public download name.');
    // The interchange permits inert metadata; the public collection does not.
    // Review plus this closed field boundary replaces regex-only publication checks.
    if (bundle.extensions || bundle.candidates.some((candidate) => candidate.signal))
      throw new Error('Public fields disallow extensions and candidate signals.');
    if (bundle.need.constraints?.length)
      throw new Error('Consumer constraints are not public Corpus fields.');
    if (identities.has(bundle.bundle_id)) throw new Error('Duplicate public bundle identity.');
    identities.add(bundle.bundle_id);
    const reviews = admission.claimReviews;
    if (
      new Set(reviews.map((r) => r.claimId)).size !== reviews.length ||
      reviews.length !== bundle.claims.length ||
      reviews.some(
        (r) =>
          !bundle.claims.some((c) => c.id === r.claimId) ||
          (r.basis === 'volatile' ? r.reviewAfterDays === null : r.reviewAfterDays !== null),
      )
    )
      throw new Error('Every claim requires one consistent freshness assessment.');
    if (Date.parse(admission.reviewedAt) > Date.parse(asOf))
      throw new Error('Public review date is in the future.');
    for (const candidate of bundle.candidates) {
      if (identities.has(candidate.id)) throw new Error('Duplicate public option identity.');
      identities.add(candidate.id);
    }
    bundles.push({ bundle, admission, bytes });
    options.push(...projectPublicOptions(bundle, admission, asOf));
  }
  return { bundles, options };
}
