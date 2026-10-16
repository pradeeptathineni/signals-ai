import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

const rootPath = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(join(rootPath, 'package.json'), 'utf8'));
const direct = { ...manifest.dependencies, ...manifest.devDependencies };
const allowedLicenses = new Set(['Apache-2.0', 'ISC', 'MIT', 'MPL-2.0']);
// First-party packages are pinned to one immutable public commit archive, not a registry range.
const firstParty = new Map([
  [
    '@pradeeptathineni/research-ai',
    {
      version: '0.1.0',
      license: 'MIT',
      source:
        /^https:\/\/github\.com\/pradeeptathineni\/research-ai\/archive\/[0-9a-f]{40}\.tar\.gz$/,
    },
  ],
]);
const lock = JSON.parse(await readFile(join(rootPath, 'package-lock.json'), 'utf8'));
const errors = [];

for (const [name, declaredVersion] of Object.entries(direct)) {
  const installed = JSON.parse(
    await readFile(join(rootPath, 'node_modules', name, 'package.json'), 'utf8'),
  );
  const pinned = firstParty.get(name);
  if (pinned) {
    const locked = lock.packages?.[`node_modules/${name}`];
    if (!pinned.source.test(declaredVersion)) {
      errors.push(`${name}: ${declaredVersion} is not a public commit archive pin`);
    }
    if (locked?.resolved !== declaredVersion || !/^sha512-/.test(locked?.integrity ?? '')) {
      errors.push(`${name}: lockfile must resolve the declared archive with sha512 integrity`);
    }
    if (installed.version !== pinned.version || locked?.version !== pinned.version) {
      errors.push(`${name}: expected ${pinned.version}, installed ${installed.version}`);
    }
    if (installed.license !== pinned.license) {
      errors.push(`${name}: unreviewed first-party license ${JSON.stringify(installed.license)}`);
    }
    continue;
  }
  if (installed.version !== declaredVersion) {
    errors.push(`${name}: declared ${declaredVersion}, installed ${installed.version}`);
  }
  if (typeof installed.license !== 'string' || !allowedLicenses.has(installed.license)) {
    errors.push(`${name}: unreviewed direct license ${JSON.stringify(installed.license)}`);
  }
}

if (errors.length) {
  process.stderr.write(`Direct dependency review failed:\n${errors.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Verified ${Object.keys(direct).length} exact direct versions and reviewed licenses.\n`,
  );
}
