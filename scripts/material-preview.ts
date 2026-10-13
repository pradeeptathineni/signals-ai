import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import {
  listPreview,
  previewSnapshot,
  previewSnapshotByteLimit,
  selectPreview,
} from '../packages/corpus/src/search-material-preview.js';

const usage = `Usage:
  material-preview list --snapshot FILE [--offset N] [--window N] [--windows N] [--source-uri HTTPS_URL]
  material-preview select --snapshot FILE --sha256 TEXT_SHA256 --start N --end N [--source-uri HTTPS_URL]
Reads one DocumentMaterial JSON file and writes a preview to stdout. Nothing is fetched or saved.`;

const commands = {
  list: { required: ['snapshot'], optional: ['offset', 'window', 'windows', 'source-uri'] },
  select: { required: ['snapshot', 'sha256', 'start', 'end'], optional: ['source-uri'] },
} as const;

/** Explicit bounded read of one regular file; size is refused before any bytes are parsed. */
function readSnapshot(path: string) {
  if (!lstatSync(path).isFile()) throw new Error('preview_snapshot_not_regular_file');
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) throw new Error('preview_snapshot_not_regular_file');
    if (stat.size > previewSnapshotByteLimit) throw new Error('preview_input_too_large');
    const buffer = Buffer.alloc(stat.size + 1);
    let length = 0;
    while (length < buffer.length) {
      const read = readSync(fd, buffer, length, buffer.length - length, null);
      if (read === 0) break;
      length += read;
    }
    if (length !== stat.size) throw new Error('preview_snapshot_changed');
    return buffer.subarray(0, length);
  } finally {
    closeSync(fd);
  }
}

function parse(argv: string[]) {
  const [command, ...rest] = argv;
  if (command !== 'list' && command !== 'select') throw new Error('missing or unknown command');
  const { required, optional } = commands[command];
  const names: string[] = [...required, ...optional];
  const parsed = parseArgs({
    args: rest,
    options: Object.fromEntries(names.map((name) => [name, { type: 'string' as const }])),
    strict: true,
    allowPositionals: false,
    tokens: true,
  });
  const seen = new Set<string>();
  for (const token of parsed.tokens) {
    if (token.kind !== 'option') continue;
    if (seen.has(token.name)) throw new Error(`--${token.name} given more than once`);
    seen.add(token.name);
  }
  const values = parsed.values as Record<string, string | undefined>;
  for (const name of required)
    if (!values[name]) throw new Error(`--${name} is required for ${command}`);
  const numbers: Record<string, number | undefined> = {};
  for (const name of ['offset', 'window', 'windows', 'start', 'end']) {
    const value = values[name];
    if (value === undefined) continue;
    if (!/^\d+$/.test(value)) throw new Error(`--${name} must be a non-negative integer`);
    numbers[name] = Number(value);
  }
  return { command, values, numbers };
}

/** One explicitly named snapshot in, one JSON preview returned for stdout; no network or file output. */
export function materialPreviewCli(argv: string[]) {
  let request: ReturnType<typeof parse>;
  try {
    request = parse(argv);
  } catch (error) {
    const stderr = `material-preview: ${(error as Error).message}\n${usage}\n`;
    return { code: 2, stdout: '', stderr };
  }
  const { command, values, numbers } = request;
  try {
    const snapshot = previewSnapshot(readSnapshot(values.snapshot!), values['source-uri']);
    const result =
      command === 'list'
        ? listPreview(snapshot, {
            offset: numbers.offset,
            windowUnits: numbers.window,
            windows: numbers.windows,
          })
        : selectPreview(snapshot, {
            expectedTextSha256: values.sha256!,
            start: numbers.start!,
            end: numbers.end!,
          });
    return { code: 0, stdout: `${JSON.stringify(result, null, 2)}\n`, stderr: '' };
  } catch (error) {
    return { code: 1, stdout: '', stderr: `material-preview: ${(error as Error).message}\n` };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { code, stdout, stderr } = materialPreviewCli(process.argv.slice(2));
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  process.exitCode = code;
}
