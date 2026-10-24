import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { join, relative } from 'node:path';

// Exact composed Research archive; version alone does not identify these capabilities.
export const researchArchive = {
  version: '0.4.0-rc.1',
  sourceCommit: '344a5ea30a36efaf3c10ca1fa4b6f3a319f01fa4',
  sha256: '0f7ab726f7267e1a7e85c4f7094d909db5a7e64671a2b319d3083aa39f6ce947',
  integrity:
    'sha512-WwROhHo9AMQHDsapnVDvhdBwTHMMYr5WzdutkbA0rb9x4wboXP8U6Qt48lD+11mQXPi60nteskdUNHuaTM2obA==',
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
