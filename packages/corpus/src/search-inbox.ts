import { readFile, lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Type } from 'typebox';
import { Value } from 'typebox/value';
import { atomicJson, withWriter } from './search-store.js';
import type { SearchResult } from '../../domain/src/search-contract.js';
const schema = Type.Array(
  Type.Object(
    {
      id: Type.String({ pattern: '^entity-[a-f0-9]{24}$' }),
      runId: Type.String({ format: 'uuid' }),
      name: Type.String({ maxLength: 200 }),
      uri: Type.String({ maxLength: 2048 }),
      at: Type.String({ maxLength: 40 }),
    },
    { additionalProperties: false },
  ),
  { maxItems: 1000 },
);
export type InboxEntry = { id: string; runId: string; name: string; uri: string; at: string };
export async function loadInbox(root: string): Promise<InboxEntry[]> {
  const path = resolve(root, '.signals/inbox.json');
  const stat = await lstat(path).catch((e: NodeJS.ErrnoException) => {
    if (e.code !== 'ENOENT') throw e;
    return null;
  });
  if (stat?.isSymbolicLink() || (stat && stat.size > 1000000)) throw new Error('unsafe_inbox');
  const parsed: unknown = stat ? JSON.parse(await readFile(path, 'utf8')) : [];
  if (!Value.Check(schema, parsed)) throw new Error('invalid_inbox');
  return parsed as InboxEntry[];
}
export async function updateInbox(
  root: string,
  result: SearchResult,
  ids: string[],
  remove = false,
) {
  const selected = result.items.filter((item) => ids.includes(item.entity.id));
  if (selected.length !== ids.length) throw new Error('inbox_selection_not_in_run');
  return withWriter(root, async () => {
    const entries = new Map((await loadInbox(root)).map((entry) => [entry.id, entry]));
    for (const item of selected) {
      if (remove) entries.delete(item.entity.id);
      else
        entries.set(item.entity.id, {
          id: item.entity.id,
          runId: result.runId,
          name: item.entity.name,
          uri: item.entity.uri,
          at: new Date().toISOString(),
        });
    }
    const next = [...entries.values()];
    if (!Value.Check(schema, next)) throw new Error('invalid_inbox');
    await atomicJson(resolve(root, '.signals/inbox.json'), next);
    return next;
  });
}
