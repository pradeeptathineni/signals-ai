import { fetchEvidence } from './search-fetch.js';
import { normalizeConsiderUrl } from '../../domain/src/url.js';
import { parseRequest, type SearchRequest } from '../../domain/src/search-contract.js';

interface DirectHit {
  provider: 'github' | 'hacker-news' | 'wikipedia';
  rank: number;
  uri: string;
  title: string;
  summary: string;
  evidenceUri: string;
  popularity: { stars?: number; points?: number; comments?: number };
}
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown) => (typeof value === 'string' ? value.slice(0, 800) : '');
const count = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;

/** Ranked locators, never assessed entities. No credentials, pagination, retries or crawling. */
export async function directSearch(
  input: SearchRequest,
  signal?: AbortSignal,
  fetch = fetchEvidence,
) {
  const request = parseRequest(input);
  const choices = request.supplementalSites ?? [
    'https://github.com',
    'https://news.ycombinator.com',
  ];
  const hits: DirectHit[] = [],
    gaps: string[] = [];
  let searches = 0;
  for (const provider of ['github', 'hacker-news'] as const) {
    if (request.sources && !request.sources.includes(provider)) continue;
    const scopes = choices.filter(
      (uri) =>
        new URL(uri).hostname === (provider === 'github' ? 'github.com' : 'news.ycombinator.com'),
    );
    const relevant = scopes.length
      ? scopes
      : [provider === 'github' ? 'https://github.com/' : 'https://news.ycombinator.com/'];
    if (provider === 'hacker-news' && scopes.some((uri) => new URL(uri).pathname !== '/')) {
      gaps.push('hacker-news: path-scoped direct search unavailable; use scoped broad search');
      continue;
    }
    if (signal?.aborted) {
      gaps.push('cancelled');
      break;
    }
    if (request.query.length > 256) {
      gaps.push(`${provider}: query exceeds direct endpoint limit; broad search remains available`);
      continue;
    }
    const endpoint = new URL(
      provider === 'github'
        ? 'https://api.github.com/search/repositories'
        : 'https://hn.algolia.com/api/v1/search',
    );
    const githubScopes = relevant.map((scope) =>
      new URL(scope).pathname.split('/').filter(Boolean),
    );
    if (
      provider === 'github' &&
      githubScopes.every((parts) => parts.length > 0) &&
      githubScopes.length > 1
    ) {
      gaps.push('github: multiple path scopes require scoped broad search');
      continue;
    }
    const parts = githubScopes[0]!;
    const qualifier =
      provider === 'github' && parts.length
        ? parts.length === 1
          ? ` user:${parts[0]}`
          : ` repo:${parts[0]}/${parts[1]}`
        : '';
    endpoint.searchParams.set(provider === 'github' ? 'q' : 'query', request.query + qualifier);
    endpoint.searchParams.set(provider === 'github' ? 'per_page' : 'hitsPerPage', '5');
    if (provider === 'hacker-news') endpoint.searchParams.set('tags', 'story');
    try {
      searches++;
      const response = object((await fetch(endpoint.toString(), signal)).json);
      if (response.incomplete_results === true) gaps.push('github: incomplete ranked results');
      const rows = response[provider === 'github' ? 'items' : 'hits'];
      if (!Array.isArray(rows)) throw new Error('invalid_direct_response');
      for (const [index, raw] of rows.slice(0, 5).entries()) {
        const row = object(raw);
        try {
          const uri = normalizeConsiderUrl(
            text(provider === 'github' ? row.html_url : row.url) ||
              `https://news.ycombinator.com/item?id=${encodeURIComponent(text(row.objectID))}`,
          ).normalizedUrl;
          const evidenceUri = normalizeConsiderUrl(
            provider === 'github'
              ? text(row.url)
              : `https://hn.algolia.com/api/v1/items/${encodeURIComponent(text(row.objectID))}`,
          ).normalizedUrl;
          if (
            provider === 'github' &&
            !relevant.some((scope) => {
              const url = new URL(scope);
              return (
                url.pathname === '/' ||
                new URL(uri).pathname === url.pathname ||
                new URL(uri).pathname.startsWith(`${url.pathname.replace(/\/$/, '')}/`)
              );
            })
          )
            continue;
          hits.push({
            provider,
            rank: index + 1,
            uri,
            evidenceUri,
            title: text(provider === 'github' ? row.full_name : row.title),
            summary: text(row.description),
            popularity:
              provider === 'github'
                ? { stars: count(row.stargazers_count) }
                : { points: count(row.points), comments: count(row.num_comments) },
          });
        } catch {
          gaps.push(`${provider}: unsafe or malformed result omitted`);
        }
      }
    } catch (failure) {
      gaps.push(
        `${provider}: ${failure instanceof Error ? failure.message : 'direct_search_failed'}`,
      );
    }
  }
  if ((!request.sources || request.sources.includes('open-web')) && !signal?.aborted) {
    const scopes = choices.filter((uri) => new URL(uri).hostname === 'en.wikipedia.org');
    if (scopes.some((uri) => new URL(uri).pathname !== '/'))
      gaps.push('wikipedia: path-scoped direct search unavailable; use scoped broad search');
    else if (request.query.length > 256)
      gaps.push('wikipedia: query exceeds direct endpoint limit; broad search remains available');
    else {
      const endpoint = new URL('https://en.wikipedia.org/w/api.php');
      for (const [key, value] of Object.entries({
        action: 'query',
        list: 'search',
        srsearch: request.query,
        srlimit: '5',
        format: 'json',
        formatversion: '2',
        srprop: 'snippet',
      }))
        endpoint.searchParams.set(key, value);
      try {
        searches++;
        const response = object((await fetch(endpoint.toString(), signal)).json);
        const rows = object(response.query).search;
        if (!Array.isArray(rows)) throw new Error('invalid_direct_response');
        for (const [index, raw] of rows.slice(0, 5).entries()) {
          const row = object(raw);
          if (!text(row.title) || count(row.pageid) === undefined) {
            gaps.push('wikipedia: malformed result omitted');
            continue;
          }
          const uri = normalizeConsiderUrl(
            `https://en.wikipedia.org/wiki/${encodeURIComponent(text(row.title).replace(/ /g, '_'))}`,
          ).normalizedUrl;
          hits.push({
            provider: 'wikipedia',
            rank: index + 1,
            uri,
            evidenceUri: uri,
            title: text(row.title),
            summary: text(row.snippet),
            popularity: {},
          });
        }
      } catch (failure) {
        gaps.push(
          `wikipedia: ${failure instanceof Error ? failure.message : 'direct_search_failed'}`,
        );
      }
    }
  }
  return {
    schemaVersion: 1,
    query: request.query,
    kind: 'unassessed-source-hits',
    hits,
    gaps,
    searches,
    modelCalls: 0,
  };
}
