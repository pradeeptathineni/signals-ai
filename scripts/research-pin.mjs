import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { join, relative } from 'node:path';

// Accepted R04 source c362b33a544bce8e3f4cce7f305bc32cddb90342; this archive is unpublished.
export const researchArchive = {
  version: '0.3.0-rc.1',
  sourceCommit: 'c362b33a544bce8e3f4cce7f305bc32cddb90342',
  sha256: '51ed349c4a3553153374891829918a2fd8354979187bf6bf0a2615cb9d7f743e',
  integrity:
    'sha512-enbCWisZ0GrY3fm/jZZ4JLdN2DXcJxdCwfrlscU9Odl2nA1NdGI42/s9k1DXb9tpvBUijLgHC778FBTcW+joZQ==',
};
export const researchSpec = `file:vendor/research-ai/${researchArchive.sha256}.tgz`;

export async function checkResearchPin(root, declared, locked, installed) {
  const errors = [];
  if (declared !== researchSpec || locked?.resolved !== researchSpec)
    errors.push('research-ai: manifest and lock must name the accepted local archive');
  if (locked?.version !== researchArchive.version || installed.version !== researchArchive.version)
    errors.push('research-ai: installed and locked versions must match the accepted source commit');
  if (locked?.integrity !== researchArchive.integrity)
    errors.push('research-ai: lock integrity differs from the accepted archive');
  if (installed.license !== 'MIT' || locked?.license !== 'MIT')
    errors.push('research-ai: installed and locked MIT license required');
  const vendor = join(root, 'vendor');
  const archiveDirectory = join(vendor, 'research-ai');
  const archive = join(archiveDirectory, `${researchArchive.sha256}.tgz`);
  const packageDirectory = join(root, 'node_modules', '@pradeeptathineni', 'research-ai');
  const canonicalRoot = await realpath(root);
  const expected = (path) => join(canonicalRoot, relative(root, path));
  for (const directory of [vendor, archiveDirectory, packageDirectory]) {
    const stat = await lstat(directory).catch(() => null);
    if (
      !stat?.isDirectory() ||
      stat.isSymbolicLink() ||
      (await realpath(directory)) !== expected(directory)
    )
      errors.push(`research-ai: directory or symlink substitution at ${directory}`);
  }
  const stat = await lstat(archive).catch(() => null);
  if (!stat?.isFile() || stat.isSymbolicLink() || (await realpath(archive)) !== expected(archive))
    errors.push('research-ai: archive must be an ordinary tracked file');
  else {
    const bytes = await readFile(archive);
    if (
      createHash('sha256').update(bytes).digest('hex') !== researchArchive.sha256 ||
      `sha512-${createHash('sha512').update(bytes).digest('base64')}` !== researchArchive.integrity
    )
      errors.push('research-ai: accepted archive bytes changed');
  }
  return errors;
}
