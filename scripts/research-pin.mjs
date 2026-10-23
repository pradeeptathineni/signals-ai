import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { join, relative } from 'node:path';

// Grounded-answer candidate; local and unpublished, pending integrator acceptance.
export const researchArchive = {
  version: '0.4.0-rc.1',
  sourceCommit: '165713c10478a5b68d949dadb922de9c08af1a51',
  sha256: 'c434781745dae9bcc9ab7f525d73bf78ad0a794c3f36e8e1dd1d209c9d3c1022',
  integrity:
    'sha512-JdYmcQ1wivWE9pMaQ9FZ6uOZMdgTUBH4KSiskg2YP8JIANOPJHm1z0qZtD+xBC1WlkewIx60mtKnJ2jHTHM9MQ==',
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
