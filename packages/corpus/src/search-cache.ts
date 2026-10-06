import { readFile, lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { atomicJson } from './search-store.js';
import { fetchEvidence, digest } from './search-fetch.js';
import { normalizeConsiderUrl } from '../../domain/src/url.js';

/** Explicit private caching retains bounded fetched text; memory/no-save never calls this. */
export function privateCacheFetch(root: string, progress?: (event: string) => void) {
  return async (uri: string, signal?: AbortSignal) => {
    const normalized = normalizeConsiderUrl(uri).normalizedUrl;
    const path = resolve(root, '.signals/source-cache', `${digest(normalized)}.json`);
    const stat = await lstat(path).catch(() => null);
    if (stat?.isSymbolicLink()) throw new Error('symlink_source_cache');
    if (stat && Date.now() - stat.mtimeMs < 3600000 && stat.size < 2200000) {
      const cached: unknown = JSON.parse(await readFile(path, 'utf8'));
      if (
        cached &&
        typeof cached === 'object' &&
        'uri' in cached &&
        cached.uri === normalized &&
        'text' in cached &&
        typeof cached.text === 'string' &&
        cached.text.length <= 2000000 &&
        'digest' in cached &&
        typeof cached.digest === 'string' &&
        /^[a-f0-9]{64}$/.test(cached.digest)
      ) {
        signal?.throwIfAborted();
        progress?.(`Private cache hit: ${new URL(normalized).hostname}`);
        return {
          uri: normalized,
          text: cached.text,
          digest: cached.digest,
          cached: true,
          fetchedAt:
            'fetchedAt' in cached && typeof cached.fetchedAt === 'string'
              ? cached.fetchedAt
              : stat.mtime.toISOString(),
        };
      }
      throw new Error('invalid_source_cache');
    }
    const fetched = await fetchEvidence(normalized, signal);
    const fetchedAt = new Date().toISOString();
    await atomicJson(path, { ...fetched, uri: normalized, fetchedAt });
    return { ...fetched, cached: false, fetchedAt };
  };
}
