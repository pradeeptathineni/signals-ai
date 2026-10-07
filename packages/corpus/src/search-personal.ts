import { readFile, lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Type } from 'typebox';
import { Value } from 'typebox/value';
import { atomicJson, withWriter } from './search-store.js';
import type { PersonalState } from '../../domain/src/search-priority.js';
const schema = Type.Record(
  Type.String({ pattern: '^entity-[a-f0-9]{24}$' }),
  Type.Object(
    {
      note: Type.String({ maxLength: 5000 }),
      feedback: Type.Enum(['none', 'skip', 'mute', 'useful']),
      novelty: Type.Enum(['confirmed-new', 'known', 'unknown']),
      seenAt: Type.String({ maxLength: 40 }),
    },
    { additionalProperties: false },
  ),
);
export async function loadPersonal(root: string): Promise<Record<string, PersonalState>> {
  const path = resolve(root, '.signals/personal.json');
  const stat = await lstat(path).catch((e: NodeJS.ErrnoException) => {
    if (e.code !== 'ENOENT') throw e;
    return null;
  });
  if (stat?.isSymbolicLink()) throw new Error('symlink_personal_state');
  if (stat && stat.size > 2000000) throw new Error('personal_state_limit');
  const parsed: unknown = stat ? JSON.parse(await readFile(path, 'utf8')) : {};
  if (!Value.Check(schema, parsed)) throw new Error('invalid_personal_state');
  return parsed as Record<string, PersonalState>;
}
export async function updatePersonal(root: string, id: string, value: PersonalState) {
  if (!Value.Check(schema, { [id]: value })) throw new Error('invalid_personal_state');
  return withWriter(root, async () => {
    const state = await loadPersonal(root);
    state[id] = value;
    await atomicJson(resolve(root, '.signals/personal.json'), state);
    return value;
  });
}
