import { expect, it } from 'vitest';
import { extractHtml, extractFeed } from './search-document.js';

it('preserves curated outlinks before readability removes navigation and never runs resources', () => {
  const doc = extractHtml(
    '<html><head><title>Collection</title></head><body><nav><a href="/tool">A useful resource</a><a href="https://127.0.0.1/private">private</a></nav><article><h1 id="scope">Scope</h1><p>This does not provide automatic security. Compare evidence before choosing a tool.</p><table><tr><th>Tool</th><th>Limit</th></tr><tr><td>A</td><td>No network</td></tr></table></article><script>globalThis.compromised=true</script><img src="https://example.com/track"></body></html>',
    'https://example.com/list',
  );
  expect(doc.links).toEqual([{ uri: 'https://example.com/tool', title: 'A useful resource' }]);
  expect(doc.text).toContain('does not provide automatic security');
  expect(doc.sections).toContainEqual({ locator: '#scope', text: 'Scope' });
  expect(doc.sections.some((x) => x.text.includes('No network'))).toBe(true);
  expect('compromised' in globalThis).toBe(false);
});
it('parses RSS and Atom strings with dates and absolute links, rejecting entity declarations', async () => {
  for (const raw of [
    '<rss version="2.0"><channel><title>Scout</title><item><title>Update</title><link>https://example.com/update</link><pubDate>Tue, 06 Oct 2026 12:00:00 GMT</pubDate></item></channel></rss>',
    '<feed xmlns="http://www.w3.org/2005/Atom"><title>Scout</title><entry><title>Update</title><link href="https://example.com/update"/><updated>2026-10-06T12:00:00Z</updated></entry></feed>',
  ]) {
    const doc = await extractFeed(raw, 'https://example.com/feed');
    expect(doc.links[0]?.uri).toBe('https://example.com/update');
    expect(doc.sections[0]?.text).toContain('2026-10-06');
  }
  await expect(
    extractFeed(
      '<!DOCTYPE a [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss/>',
      'https://example.com',
    ),
  ).rejects.toThrow('feed_external_entity_denied');
});
