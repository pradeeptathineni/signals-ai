import { readFile, writeFile } from 'node:fs/promises';
import { createPool } from '../packages/db/src/client.js';
import {
  importEvidenceDraft,
  reviewEvidenceDraft,
  exportEvidence,
  recordEvidenceFeedback,
} from '../packages/db/src/evidence-repository.js';
import { localWorkspaceId } from '../packages/seed/src/import.js';
import { parseEvidenceBundle } from '../packages/domain/src/evidence-exchange.js';

const [operation, target, argument, predecessorId] = process.argv.slice(2);
if (!target || !operation)
  throw new Error(
    'Usage: evidence validate/import FILE | review DRAFT_ID RATIONALE [PREDECESSOR_ID] | export BUNDLE_ID FILE | feedback BUNDLE_ID INPUT.json',
  );
if (operation === 'validate') {
  const bytes = await readFile(target, 'utf8');
  const digest = (await readFile(`${target}.sha256`, 'utf8')).trim();
  const bundle = parseEvidenceBundle(bytes, digest);
  process.stdout.write(
    `${JSON.stringify({ valid: true, digest, mode: bundle.mode, sources: bundle.sources.length, claims: bundle.claims.length })}\n`,
  );
} else {
  const pool = createPool();
  try {
    let result: unknown;
    if (operation === 'import') {
      result = await importEvidenceDraft(
        pool,
        localWorkspaceId,
        await readFile(target, 'utf8'),
        (await readFile(`${target}.sha256`, 'utf8')).trim(),
      );
    } else if (operation === 'review' && argument) {
      result = await reviewEvidenceDraft(pool, localWorkspaceId, target, {
        actor: 'agent-reviewed',
        rationale: argument,
        blockers: [],
        ...(predecessorId ? { predecessorId } : {}),
      });
    } else if (operation === 'export' && argument) {
      const exported = await exportEvidence(pool, target);
      await writeFile(argument, exported.bytes, { flag: 'wx' });
      await writeFile(`${argument}.sha256`, `${exported.digest}\n`, { flag: 'wx' });
      result = {
        digest: exported.digest,
        bytes: Buffer.byteLength(exported.bytes),
        changes: exported.changes,
      };
    } else if (operation === 'feedback' && argument) {
      const input: unknown = JSON.parse(await readFile(argument, 'utf8'));
      // API is the typed path; CLI uses its same input validation and exact binding.
      result = await recordEvidenceFeedback(
        pool,
        localWorkspaceId,
        target,
        input as Parameters<typeof recordEvidenceFeedback>[3],
      );
    } else throw new Error('Unknown operation or missing argument.');
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await pool.end();
  }
}
