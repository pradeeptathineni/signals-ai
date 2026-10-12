import { resolve } from 'node:path';
import { lstat } from 'node:fs/promises';
import { Type, type Static } from 'typebox';
import { Value } from 'typebox/value';
import {
  projectNativeLibrary,
  projectLegacyLibrary,
  type LibraryFinding,
} from '../../domain/src/library-search.js';
import {
  loadEntities,
  readPrivateJson,
  withWriter,
  atomicJson,
  selectionHistory,
  loadRun,
} from './search-store.js';
import { loadPublicCorpus } from './public-corpus.js';
import { loadPersonal, updatePersonal } from './search-personal.js';
import { loadLibraryLeads } from './library-leads.js';
import { loadAnswerLibrary } from './research-receipts.js';

const annotationSchema = Type.Object(
  {
    note: Type.Optional(Type.String({ maxLength: 4000 })),
    feedback: Type.Optional(Type.Enum(['none', 'skip', 'mute', 'useful'])),
    novelty: Type.Optional(Type.Enum(['confirmed-new', 'known', 'unknown'])),
  },
  { additionalProperties: false },
);
export type LibraryCollectionPatch = Static<typeof annotationSchema>;
const collectionSchema = Type.Object(
  {
    version: Type.Literal(1),
    collection: Type.Record(
      Type.String({
        pattern: '^(?:native|legacy|lead|answer):(?:public|private):[a-zA-Z0-9._:-]{1,200}$',
      }),
      Type.Object(
        {
          saved: Type.Boolean(),
          updatedAt: Type.String({ maxLength: 40 }),
          ...annotationSchema.properties,
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);
type CollectionState = Static<typeof collectionSchema>;
async function collectionState(root: string): Promise<CollectionState> {
  const state = await readPrivateJson(root, 'library-state.json', { version: 1, collection: {} });
  if (!Value.Check(collectionSchema, state)) throw new Error('invalid_library_collection');
  if (Object.values(state.collection).some((row) => !Number.isFinite(Date.parse(row.updatedAt))))
    throw new Error('invalid_library_collection');
  return state;
}
async function legacy(root: string) {
  const directory = resolve(root, 'signals');
  if (
    !(await lstat(directory).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    }))
  )
    return [];
  // Native-only empty collections are valid; all other reader integrity failures stay visible.
  try {
    return (await loadPublicCorpus(directory)).options.map(projectLegacyLibrary);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'Empty canonical Corpus cannot replace published knowledge.'
    )
      return [];
    throw error;
  }
}
/** Research can proceed with valid stores when another store fails, with explicit coverage gaps. */
export async function loadResearchLibrary(root: string) {
  const stores = await Promise.allSettled([
    loadEntities(resolve(root, 'signals/entities')).then((rows) =>
      rows.map((row) => projectNativeLibrary(row, 'public')),
    ),
    loadEntities(resolve(root, '.signals/corpus/entities')).then((rows) =>
      rows.map((row) => projectNativeLibrary(row, 'private')),
    ),
    legacy(root),
  ]);
  return {
    findings: stores.flatMap((store) => (store.status === 'fulfilled' ? store.value : [])),
    gaps: stores.some((store) => store.status === 'rejected')
      ? ['Some saved Corpus records could not be validated; native research remains available.']
      : [],
  };
}
/** Canonical facts are the only corpus; normalized rows are disposable browser projections. */
export async function loadLibrary(
  root: string,
  options: { scope?: 'local' | 'public' | 'research' } = {},
): Promise<LibraryFinding[]> {
  if (options.scope === 'research') return (await loadResearchLibrary(root)).findings;
  const publicRecords = await loadEntities(resolve(root, 'signals/entities'));
  const findings = [
    ...publicRecords.map((record) => projectNativeLibrary(record, 'public')),
    ...(await legacy(root)),
  ];
  if (options.scope === 'public') return findings;
  const privateRecords = await loadEntities(resolve(root, '.signals/corpus/entities'));
  findings.push(...privateRecords.map((record) => projectNativeLibrary(record, 'private')));
  findings.push(...(await loadLibraryLeads(root)));
  findings.push(...(await loadAnswerLibrary(root)));
  const personal = await loadPersonal(root);
  const state = await collectionState(root);
  return findings.map((finding) => {
    const collection = state.collection[finding.key];
    const annotation = finding.origin.format === 'native' ? personal[finding.id] : undefined;
    const notes = finding.origin.format === 'native' ? annotation?.note : collection?.note;
    return {
      ...finding,
      saved: collection?.saved ?? true,
      ...(notes ? { notes } : {}),
      feedback:
        (finding.origin.format === 'native' ? annotation?.feedback : collection?.feedback) ??
        'none',
      novelty:
        (finding.origin.format === 'native' ? annotation?.novelty : collection?.novelty) ??
        'unknown',
    };
  });
}
/** Only an immutable selected trail in the chosen store can bind a saved vote to a parent. */
export async function retainedIntroducingParent(
  root: string,
  id: string,
  destination?: 'public' | 'private',
) {
  const selections = (await selectionHistory(root))
    .filter((row) => row.selected.includes(id) && (!destination || row.destination === destination))
    .reverse();
  for (const selection of selections) {
    const run = await loadRun(selection.runId, root).catch(() => null);
    const trail = run?.items.find((item) => item.entity.id === id)?.discovery;
    if (trail?.linkVerified && trail.provenanceBasis === 'configured-source' && trail.parentUri)
      return trail.parentUri;
  }
  return undefined;
}
/** Unsave only changes local collection state: canonical evidence, history and associations survive. */
export async function setLibrarySaved(
  root: string,
  key: string,
  saved: boolean,
  patch: LibraryCollectionPatch = {},
) {
  if (typeof key !== 'string' || typeof saved !== 'boolean')
    throw new Error('invalid_library_collection_change');
  if (!Value.Check(annotationSchema, patch)) throw new Error('invalid_library_collection_change');
  const finding = (await loadLibrary(root)).find((row) => row.key === key);
  if (!finding) throw new Error('unknown_library_finding');
  if (finding.origin.format === 'native' && Object.keys(patch).length) {
    const prior = (await loadPersonal(root))[finding.id];
    const introducing =
      patch.feedback !== undefined
        ? await retainedIntroducingParent(root, finding.id, finding.origin.destination)
        : undefined;
    await updatePersonal(
      root,
      finding.id,
      {
        note: patch.note ?? prior?.note ?? '',
        feedback: patch.feedback ?? prior?.feedback ?? 'none',
        novelty: patch.novelty ?? prior?.novelty ?? 'unknown',
        seenAt: new Date().toISOString(),
      },
      introducing,
    );
  }
  return withWriter(root, async () => {
    const state = await collectionState(root);
    state.collection[key] = {
      ...state.collection[key],
      ...(finding.origin.format !== 'native' ? patch : {}),
      saved,
      updatedAt: new Date().toISOString(),
    };
    await atomicJson(resolve(root, '.signals/library-state.json'), state);
    return {
      ...finding,
      saved,
      ...(patch.note !== undefined ? { notes: patch.note } : {}),
      ...(patch.feedback !== undefined ? { feedback: patch.feedback } : {}),
      ...(patch.novelty !== undefined ? { novelty: patch.novelty } : {}),
    };
  });
}
