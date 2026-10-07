import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import Parser from 'rss-parser';
import { Type } from 'typebox';
import { Value } from 'typebox/value';
import { normalizeConsiderUrl } from '../../domain/src/url.js';
import { normalizeSpan } from './search-fetch.js';

export interface DocumentMaterial {
  text: string;
  title: string;
  author: string | null;
  publishedAt: string | null;
  links: { uri: string; title: string }[];
  sections: { locator: string; text: string; provenance?: unknown[] }[];
  extractor: string;
}
const bounded = Type.String({ maxLength: 2000000 });
const materialSchema = Type.Object(
  {
    text: bounded,
    title: bounded,
    author: Type.Union([bounded, Type.Null()]),
    publishedAt: Type.Union([bounded, Type.Null()]),
    links: Type.Array(Type.Object({ uri: bounded, title: bounded }), { maxItems: 200 }),
    sections: Type.Array(
      Type.Object({
        locator: bounded,
        text: bounded,
        provenance: Type.Optional(Type.Array(Type.Unknown())),
      }),
      { maxItems: 1000 },
    ),
    extractor: bounded,
  },
  { additionalProperties: false },
);
export function cachedMaterial(value: unknown): DocumentMaterial | undefined {
  if (value === undefined) return undefined;
  if (!Value.Check(materialSchema, value)) throw new Error('invalid_cached_document');
  for (const link of value.links) normalizeConsiderUrl(link.uri);
  return value;
}
const date = (value?: string | null) =>
  value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
export function publicLink(value: string, base: string) {
  try {
    return normalizeConsiderUrl(new URL(value, base).toString()).normalizedUrl;
  } catch {
    return null;
  }
}

/** Inert DOM only: no script execution, browser, resource loader or network convenience methods. */
export function extractHtml(raw: string, uri: string): DocumentMaterial {
  const { document } = parseHTML(raw);
  const title = document.querySelector('title')?.textContent?.trim() ?? '';
  const publishedAt = date(
    document.querySelector('meta[property="article:published_time"]')?.getAttribute('content'),
  );
  const links = [...document.querySelectorAll('a[href]')].slice(0, 1000).flatMap((node) => {
    const link = publicLink(node.getAttribute('href') ?? '', uri);
    return link ? [{ uri: link, title: normalizeSpan(node.textContent ?? '').slice(0, 200) }] : [];
  });
  for (const node of document.querySelectorAll('script,style,iframe,object,embed')) node.remove();
  const fallback = normalizeSpan(document.body?.textContent ?? document.textContent ?? '');
  const sections = [...document.querySelectorAll('h1,h2,h3,table')]
    .slice(0, 80)
    .map((node, index) => ({
      locator: node.id ? `#${node.id}` : `section:${index + 1}`,
      text: normalizeSpan(node.textContent ?? '').slice(0, 4000),
    }));
  let article;
  try {
    article = new Readability(document, { maxElemsToParse: 30000 }).parse();
  } catch {
    /* Link-rich hubs retain their original text and outlinks. */
  }
  return {
    text: normalizeSpan(`${article?.title || title}\n${article?.textContent || fallback}`),
    title: article?.title || title,
    author: article?.byline || null,
    publishedAt: date(article?.publishedTime) ?? publishedAt,
    links: [...new Map(links.map((link) => [link.uri, link])).values()].slice(0, 200),
    sections,
    extractor: 'readability-0.6.0',
  };
}

export async function extractFeed(raw: string, uri: string): Promise<DocumentMaterial> {
  if (/<!DOCTYPE|<!ENTITY/i.test(raw)) throw new Error('feed_external_entity_denied');
  const feed = await new Parser().parseString(raw);
  const links = feed.items.slice(0, 100).flatMap((item) => {
    const link = publicLink(item.link ?? '', uri);
    return link ? [{ uri: link, title: (item.title ?? '').slice(0, 200) }] : [];
  });
  return {
    text: normalizeSpan(
      feed.items
        .slice(0, 100)
        .map((item) => `${item.title ?? ''} ${item.contentSnippet ?? ''}`)
        .join('\n'),
    ),
    title: feed.title ?? '',
    author: null,
    publishedAt: date(typeof feed.lastBuildDate === 'string' ? feed.lastBuildDate : null),
    links,
    sections: feed.items.slice(0, 100).map((item, index) => ({
      locator: `item:${index + 1}`,
      text: normalizeSpan(
        `${item.title ?? ''} ${item.contentSnippet ?? ''} ${date(item.isoDate) ?? ''}`,
      ),
    })),
    extractor: 'rss-parser-3.13.0',
  };
}
