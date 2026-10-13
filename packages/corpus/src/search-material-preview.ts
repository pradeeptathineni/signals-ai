import { createHash } from 'node:crypto';
import { normalizeConsiderUrl } from '../../domain/src/url.js';
import { cachedMaterial, materialOmissions, type DocumentMaterial } from './search-document.js';
import { digest } from './search-fetch.js';
import { validateLayoutProjection } from './search-html-layout.js';

/** Same UTF16 budget as whole-source claim material; previews never truncate to fit it. */
const previewRangeLimit = 48000;
export const previewSnapshotByteLimit = 16 * 1024 * 1024;
const snippetUnits = 160;

const coordinate =
  'Zero-based UTF16 code units in the exact normalized text; start inclusive, end exclusive.';
const notices = [
  'Preview artifact only: not a search result, evidence receipt, peer bundle, score, assessment or source-completeness verdict.',
  'The snapshot is caller-supplied and not independently authenticated. inputSha256 distinguishes input bytes only; a source URI label does not establish transport identity or freshness.',
  'Even the complete normalized text does not prove complete source coverage.',
  'Table spans refer to generated projections. Row/column labels and delimiters are generated, not raw-source verbatim quotations. Cell geometry is omitted.',
];

export interface PreviewSnapshot {
  material: DocumentMaterial;
  inputSha256: string;
  sourceUriLabel: string | null;
}

/** Validates caller bytes with the existing material readers; never renormalizes text. */
export function previewSnapshot(bytes: Uint8Array, sourceUri?: string): PreviewSnapshot {
  if (bytes.length > previewSnapshotByteLimit) throw new Error('preview_input_too_large');
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new Error('preview_malformed_material');
  }
  const material = cachedMaterial(value);
  if (!material) throw new Error('preview_malformed_material');
  if (!material.text.isWellFormed()) throw new Error('preview_invalid_unicode');
  // Historical material without a layout scope can still carry recognized table spans.
  validateLayoutProjection(material.text, material.sections);
  let sourceUriLabel: string | null = null;
  if (sourceUri !== undefined)
    try {
      normalizeConsiderUrl(sourceUri);
      sourceUriLabel = sourceUri;
    } catch {
      throw new Error('preview_invalid_source_uri');
    }
  return {
    material,
    inputSha256: createHash('sha256').update(bytes).digest('hex'),
    sourceUriLabel,
  };
}

const high = (code: number) => code >= 0xd800 && code <= 0xdbff;
const low = (code: number) => code >= 0xdc00 && code <= 0xdfff;
const splitsPair = (text: string, index: number) =>
  index > 0 &&
  index < text.length &&
  high(text.charCodeAt(index - 1)) &&
  low(text.charCodeAt(index));
const pairSafeEnd = (text: string, end: number) => (splitsPair(text, end) ? end - 1 : end);
const integer = (value: number, min: number, max: number, code: string) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(code);
  return value;
};

/** Original table spans overlapping a range; clipped or rebased geometry is never emitted. */
function tableOverlaps(material: DocumentMaterial, start: number, end: number) {
  return material.sections.flatMap((section) =>
    (section.provenance ?? []).flatMap((value) => {
      if (!value || typeof value !== 'object' || !('kind' in value)) return [];
      if (value.kind !== 'html-table-v1') return [];
      const table = value as unknown as { table: number; start: number; end: number };
      if (!(table.start < end && start < table.end)) return [];
      return [
        {
          locator: section.locator,
          table: table.table,
          tableStart: table.start,
          tableEnd: table.end,
          fullyWithinRange: start <= table.start && table.end <= end,
        },
      ];
    }),
  );
}

function header(snapshot: PreviewSnapshot) {
  const { material } = snapshot;
  return {
    kind: 'normalized-text-preview' as const,
    notices,
    coordinate,
    textSha256: digest(material.text),
    textLength: material.text.length,
    inputSha256: snapshot.inputSha256,
    sourceUriLabel: snapshot.sourceUriLabel,
    extractor: material.extractor,
    omissions: materialOmissions(material),
  };
}

/** Unranked text-order windows from an explicit offset; navigation aids, not prose sections. */
export function listPreview(
  snapshot: PreviewSnapshot,
  options: { offset?: number; windowUnits?: number; windows?: number } = {},
) {
  const { text } = snapshot.material;
  const offset = integer(options.offset ?? 0, 0, text.length, 'preview_invalid_offset');
  if (splitsPair(text, offset)) throw new Error('preview_offset_splits_surrogate');
  const windowUnits = integer(
    options.windowUnits ?? 4000,
    2,
    previewRangeLimit,
    'preview_invalid_window',
  );
  const count = integer(options.windows ?? 20, 1, 100, 'preview_invalid_window_count');
  const windows = [];
  let start = offset;
  while (start < text.length && windows.length < count) {
    const end = pairSafeEnd(text, Math.min(start + windowUnits, text.length));
    const snippetEnd = pairSafeEnd(text, Math.min(start + snippetUnits, end));
    windows.push({
      start,
      end,
      units: end - start,
      snippet: text.slice(start, snippetEnd),
      snippetIsWholeWindow: snippetEnd === end,
    });
    start = end;
  }
  return {
    ...header(snapshot),
    navigation:
      'Mechanical windows in text order, unranked. Snippets are window openings, not semantic or complete prose sections. Windows end one unit early rather than split a surrogate pair.',
    page: {
      offset,
      end: start,
      windowUnits,
      windows,
      nextOffset: start < text.length ? start : null,
      remainingUnits: text.length - start,
    },
    tables: tableOverlaps(snapshot.material, offset, start),
  };
}

/** Exactly text.slice(start, end) after the caller's expected digest matches. */
export function selectPreview(
  snapshot: PreviewSnapshot,
  request: { expectedTextSha256: string; start: number; end: number },
) {
  const { text } = snapshot.material;
  const expected: unknown = request.expectedTextSha256;
  if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected))
    throw new Error('preview_invalid_digest');
  if (expected !== digest(text)) throw new Error('preview_stale_digest');
  const start = integer(request.start, 0, text.length, 'preview_invalid_range');
  const end = integer(request.end, 0, text.length, 'preview_invalid_range');
  if (start >= end) throw new Error('preview_invalid_range');
  if (end - start > previewRangeLimit) throw new Error('preview_range_over_budget');
  if (splitsPair(text, start) || splitsPair(text, end))
    throw new Error('preview_range_splits_surrogate');
  return {
    ...header(snapshot),
    selection: { start, end, units: end - start, text: text.slice(start, end) },
    outsideSelection: {
      note: 'Normalized text outside the selection is omitted from this preview.',
      before: { start: 0, end: start, units: start },
      after: { start: end, end: text.length, units: text.length - end },
    },
    tables: tableOverlaps(snapshot.material, start, end),
  };
}
