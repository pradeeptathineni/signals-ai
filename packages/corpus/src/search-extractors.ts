import { fetchEvidence, resolvePublicUrl, digest } from './search-fetch.js';
import type { DocumentMaterial } from './search-document.js';
import { publicLink } from './search-document.js';
import { runProviderProcess } from './search-provider-process.js';
import type { AcquisitionConfig } from './search-acquisition.js';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Hosted fallback discloses only a public target URL. Access denials never trigger it. */
export async function jinaDocument(
  uri: string,
  signal?: AbortSignal,
  dependencies = { fetch: fetchEvidence, validate: resolvePublicUrl },
) {
  await dependencies.validate(uri);
  const result = await dependencies.fetch(`https://r.jina.ai/${uri}`, signal);
  const body = result.text;
  if (/\b(?:401|403|429|access denied|captcha|login required)\b/i.test(body.slice(0, 1000)))
    throw new Error('reader_source_denied');
  const title = /Title:\s*([^\n]+)/i.exec(body)?.[1]?.slice(0, 200) ?? new URL(uri).hostname;
  const links = [...body.matchAll(/\[([^\]]{0,200})\]\((https:\/\/[^\s)]+)\)/g)]
    .slice(0, 200)
    .flatMap((match) => {
      const link = publicLink(match[2]!, uri);
      return link ? [{ uri: link, title: match[1]! }] : [];
    });
  const material: DocumentMaterial = {
    text: body,
    title,
    author: null,
    publishedAt: null,
    links,
    sections: [],
    extractor: 'jina-reader-hosted',
  };
  return {
    text: body,
    digest: digest(body),
    uri,
    normalizer: 'text-v2' as const,
    material,
    identityUnverified: true,
    truncated: /truncat|partial content/i.test(body),
  };
}
export function normalizeDocling(value: unknown): DocumentMaterial {
  if (
    !value ||
    typeof value !== 'object' ||
    !('schema_version' in value) ||
    value.schema_version !== 1 ||
    !('text' in value) ||
    typeof value.text !== 'string' ||
    !('sections' in value) ||
    !Array.isArray(value.sections)
  )
    throw new Error('invalid_docling_document');
  const sections = value.sections.slice(0, 1000).map((item: unknown) => {
    if (
      !item ||
      typeof item !== 'object' ||
      !('locator' in item) ||
      typeof item.locator !== 'string' ||
      !('text' in item) ||
      typeof item.text !== 'string' ||
      !('provenance' in item) ||
      !Array.isArray(item.provenance)
    )
      throw new Error('invalid_docling_locator');
    if (
      item.provenance.some(
        (p: unknown) =>
          !p ||
          typeof p !== 'object' ||
          !('page' in p) ||
          !Number.isSafeInteger(p.page) ||
          Number(p.page) < 1,
      )
    )
      throw new Error('invalid_docling_page');
    return { locator: item.locator, text: item.text.slice(0, 12000), provenance: item.provenance };
  });
  return {
    text: value.text.slice(0, 2000000),
    title: 'Structured document',
    author: null,
    publishedAt: null,
    links: [],
    sections,
    extractor: 'docling-local',
  };
}
export async function doclingDocument(
  uri: string,
  config: NonNullable<AcquisitionConfig['docling']>,
  signal?: AbortSignal,
) {
  if (!config.modelsAuthorized)
    throw new Error('document_extraction_unavailable_models_not_authorized');
  const fetched = await fetchEvidence(uri, signal, 0, true);
  if (!fetched.bytes) return fetched;
  const directory = await mkdtemp(join(tmpdir(), 'signals-document-'));
  try {
    const documentPath = join(directory, 'document.pdf');
    await writeFile(documentPath, fetched.bytes, { mode: 0o600 });
    const output = await runProviderProcess(
      config.python,
      fileURLToPath(new URL('../../../scripts/research-provider.py', import.meta.url)),
      {
        provider: 'docling',
        document_path: documentPath,
        artifacts_path: config.artifactsPath,
        model_downloads_authorized: true,
        expected_version: config.version,
      },
      [],
      signal,
    );
    const material = normalizeDocling(output);
    return {
      uri: fetched.uri,
      digest: fetched.digest,
      text: material.text,
      normalizer: 'text-v2' as const,
      material,
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
export function configuredDocumentFetch(
  jina = false,
  fetch = fetchEvidence,
  docling?: AcquisitionConfig['docling'],
) {
  return async (uri: string, signal?: AbortSignal) => {
    try {
      return await fetch(uri, signal);
    } catch (e) {
      if (e instanceof Error && e.message === 'unsupported_content') {
        if (docling) return doclingDocument(uri, docling, signal);
        throw new Error('document_extraction_unavailable');
      }
      if (
        !jina ||
        /denied|forbidden|blocked|private|dns|redirect|bytes_limit|cancel|abort|404/i.test(
          e instanceof Error ? e.message : '',
        )
      )
        throw e;
      return jinaDocument(uri, signal);
    }
  };
}
