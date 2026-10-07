import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { normalizeConsiderUrl } from '../../domain/src/url.js';
import type { SearchRequest } from '../../domain/src/search-contract.js';
import { fetchEvidence } from './search-fetch.js';
import { fileURLToPath } from 'node:url';
import { runProviderProcess } from './search-provider-process.js';
import { Type } from 'typebox';
import { Value } from 'typebox/value';

const exec = promisify(execFile);
export const last30daysPin = '7f582ad8c2e140eca08098b245f9e31b68e28b60';
export interface AcquisitionConfig {
  publicApis?: boolean;
  searxng?: string;
  jina?: boolean;
  docling?: { python: string; artifactsPath: string; modelsAuthorized: boolean; version: string };
  gptResearcher?: {
    python: string;
    configPath: string;
    billingAuthorized: boolean;
    keyEnv: string[];
  };
  last30days?: { checkout: string; python: string; discovery?: boolean };
}
export interface AcquisitionHit {
  provider: string;
  uri: string;
  title: string;
  summary: string;
  publishedAt: string | null;
  introducedBy: 'unseeded-query' | 'hub-discovered';
  parentUri?: string;
}
const object = (x: unknown): Record<string, unknown> =>
  x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
const text = (x: unknown, max = 1600) => (typeof x === 'string' ? x.slice(0, max) : '');
const path = Type.String({ maxLength: 2048, minLength: 1 });
const python = Type.String({ pattern: '^/[^\\n]+/python3(?:\\.\\d+)?$', maxLength: 2048 });
const closed = { additionalProperties: false };
const configSchema = Type.Object(
  {
    publicApis: Type.Optional(Type.Boolean()),
    jina: Type.Optional(Type.Boolean()),
    searxng: Type.Optional(path),
    last30days: Type.Optional(
      Type.Object({ checkout: path, python, discovery: Type.Optional(Type.Boolean()) }, closed),
    ),
    gptResearcher: Type.Optional(
      Type.Object(
        {
          python,
          configPath: path,
          billingAuthorized: Type.Boolean(),
          keyEnv: Type.Array(
            Type.Enum(['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'TAVILY_API_KEY', 'EXA_API_KEY']),
            { maxItems: 4, uniqueItems: true },
          ),
        },
        closed,
      ),
    ),
    docling: Type.Optional(
      Type.Object(
        {
          python,
          artifactsPath: path,
          modelsAuthorized: Type.Boolean(),
          version: Type.String({ pattern: '^\\d+\\.\\d+\\.\\d+$' }),
        },
        closed,
      ),
    ),
  },
  closed,
);

/** Provider rank/engagement never becomes evidence strength or final relevance. */
export function normalizeAcquisition(
  input: unknown,
  provider: 'searxng' | 'last30days' | 'gpt-researcher',
) {
  const body = object(input),
    hits: AcquisitionHit[] = [],
    gaps: string[] = [];
  if (provider === 'last30days' && !['1.3', '1.1'].includes(String(body.schema_version)))
    throw new Error('unsupported_last30days_schema');
  const rows =
    provider === 'gpt-researcher'
      ? body.sources
      : body.schema_version === '1.1' && Array.isArray(body.results)
        ? body.results.flatMap((item) => {
            const row = object(item);
            return Array.isArray(row.evidence_urls)
              ? row.evidence_urls.map((url) => ({
                  url,
                  title: row.topic,
                  summary: row.why_spiking,
                }))
              : [];
          })
        : body.results;
  if (!Array.isArray(rows)) throw new Error('invalid_provider_schema');
  for (const item of rows.slice(0, 60)) {
    const row = object(item);
    try {
      const uri = normalizeConsiderUrl(text(row.url ?? row.href, 2048)).normalizedUrl;
      const title = text(row.title, 200);
      if (!title) throw new Error('missing_title');
      const published = text(row.published_at ?? row.publishedDate, 40);
      hits.push({
        provider,
        uri,
        title,
        summary: text(row.summary ?? row.content),
        publishedAt:
          published && Number.isFinite(Date.parse(published))
            ? new Date(published).toISOString()
            : null,
        introducedBy: body.schema_version === '1.1' ? 'hub-discovered' : 'unseeded-query',
      });
    } catch {
      gaps.push(`${provider}: malformed/unsafe candidate omitted`);
    }
  }
  for (const [source, state] of Object.entries(object(body.source_status)))
    if (!['ok', 'success', 'available', 'completed'].includes(String(state)))
      gaps.push(`${provider}/${source}: ${String(state).slice(0, 100)}`);
  return { hits, gaps };
}

export async function loadAcquisitionConfig(root: string): Promise<AcquisitionConfig> {
  const raw = await readFile(resolve(root, '.signals/providers.json'), 'utf8').catch(
    (e: NodeJS.ErrnoException) => {
      if (e.code !== 'ENOENT') throw e;
      return '{}';
    },
  );
  const x = object(JSON.parse(raw));
  if (!Value.Check(configSchema, x)) throw new Error('invalid_acquisition_config');
  if (x.searxng) normalizeConsiderUrl(text(x.searxng, 2048));
  return x as AcquisitionConfig;
}

export async function acquireConfigured(
  request: SearchRequest,
  config: AcquisitionConfig,
  signal?: AbortSignal,
  fetch = fetchEvidence,
) {
  const hits: AcquisitionHit[] = [],
    gaps: string[] = [];
  let searches = 0;
  let modelCalls = 0;
  if (config.gptResearcher) {
    if (!config.gptResearcher.billingAuthorized)
      gaps.push(
        'gpt-researcher: missing explicitly authorized API budget (Pro subscription supplies no assumed credit)',
      );
    else {
      try {
        modelCalls++;
        const output = await runProviderProcess(
          config.gptResearcher.python,
          fileURLToPath(new URL('../../../scripts/research-provider.py', import.meta.url)),
          {
            provider: 'gpt-researcher',
            query: request.query,
            billing_authorized: true,
            config_path: config.gptResearcher.configPath,
            expected_version: '0.16.0',
          },
          config.gptResearcher.keyEnv,
          signal,
        );
        const result = normalizeAcquisition(output, 'gpt-researcher');
        hits.push(...result.hits);
        gaps.push(...result.gaps);
      } catch (e) {
        gaps.push(`gpt-researcher: ${e instanceof Error ? e.message : 'failed'}`);
      }
    }
  }
  if (config.searxng && (!request.sources || request.sources.includes('open-web'))) {
    const endpoint = new URL(config.searxng);
    endpoint.searchParams.set('q', request.query);
    endpoint.searchParams.set('format', 'json');
    try {
      searches++;
      const result = normalizeAcquisition(
        (await fetch(endpoint.toString(), signal)).json,
        'searxng',
      );
      hits.push(...result.hits);
      gaps.push(...result.gaps);
    } catch (e) {
      gaps.push(`searxng: ${e instanceof Error ? e.message : 'failed'}`);
    }
  }
  if (config.last30days && (!request.sources || request.sources.includes('hacker-news'))) {
    const home = await mkdtemp(join(tmpdir(), 'signals-acquisition-'));
    try {
      signal?.throwIfAborted();
      const pin = (
        await exec('git', ['-C', config.last30days.checkout, 'rev-parse', 'HEAD'], {
          timeout: 5000,
        })
      ).stdout.trim();
      if (pin !== last30daysPin) throw new Error('unreviewed_last30days_revision');
      const args = [
        resolve(config.last30days.checkout, 'skills/last30days/scripts/last30days.py'),
        ...(config.last30days.discovery
          ? ['--discover', request.query, '--discover-shallow']
          : [request.query]),
        '--search',
        'hackernews',
        '--quick',
        '--no-browser-cookies',
        '--no-verify-freshness',
        '--emit=json',
        '--save-dir',
        join(home, 'output'),
      ];
      searches++;
      const result = await exec(config.last30days.python, args, {
        cwd: home,
        signal,
        timeout: 90000,
        maxBuffer: 2000000,
        env: {
          PATH: '/usr/bin:/bin',
          HOME: home,
          LAST30DAYS_CONFIG_DIR: '',
          LAST30DAYS_SKIP_KEYCHAIN: '1',
        },
      });
      const parsed = normalizeAcquisition(JSON.parse(result.stdout), 'last30days');
      hits.push(...parsed.hits);
      gaps.push(...parsed.gaps);
    } catch (e) {
      gaps.push(`last30days: ${e instanceof Error ? e.message.slice(0, 240) : 'failed'}`);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  }
  return { hits, gaps, searches, modelCalls, kind: 'unassessed-source-hits', cost: null };
}
