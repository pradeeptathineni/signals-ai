import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { test } from 'node:test';
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, URL } from 'node:url';
import { checkResearchPin, researchArchive, researchSpec } from './research-pin.mjs';

const source = fileURLToPath(
  new URL(`../vendor/research-ai/${researchArchive.sha256}.tgz`, import.meta.url),
);
const locked = {
  version: researchArchive.version,
  resolved: researchSpec,
  integrity: researchArchive.integrity,
  license: 'MIT',
};
const installed = { version: researchArchive.version, license: 'MIT' };

test('accepts only the exact tracked package archive, lock and extracted installation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'signals-research-pin-'));
  const archiveDirectory = join(root, 'vendor/research-ai');
  const archive = join(archiveDirectory, `${researchArchive.sha256}.tgz`);
  const packageDirectory = join(root, 'node_modules/@pradeeptathineni/research-ai');
  try {
    await mkdir(archiveDirectory, { recursive: true });
    await mkdir(packageDirectory, { recursive: true });
    await copyFile(source, archive);
    const check = (spec = researchSpec, lock = locked, metadata = installed) =>
      checkResearchPin(root, spec, lock, metadata);
    assert.deepEqual(await check(), []);
    assert.match((await check('file:vendor/research-ai/other.tgz')).join(' '), /manifest and lock/);
    assert.match(
      (await check(researchSpec, { ...locked, integrity: 'sha512-wrong' })).join(' '),
      /integrity/,
    );
    assert.match(
      (await check(researchSpec, { ...locked, version: '0.1.0' })).join(' '),
      /versions/,
    );
    assert.match(
      (await check(researchSpec, locked, { ...installed, version: '0.1.0' })).join(' '),
      /versions/,
    );
    const bytes = await readFile(archive);
    await writeFile(archive, Buffer.concat([bytes, Buffer.from('changed')]));
    assert.match((await check()).join(' '), /bytes changed/);
    await rm(archive);
    await symlink(source, archive);
    assert.match((await check()).join(' '), /ordinary tracked file/);
    await rm(archive);
    await mkdir(archive);
    assert.match((await check()).join(' '), /ordinary tracked file/);
    await rm(packageDirectory, { recursive: true });
    await symlink(archiveDirectory, packageDirectory);
    assert.match((await check()).join(' '), /directory or symlink substitution/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
