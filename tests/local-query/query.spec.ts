import { expect, test } from '@playwright/test';
import { readFile, unlink, writeFile, mkdir, symlink } from 'node:fs/promises';
import { resolve } from 'node:path';

for (const suffix of ['', '?raw', '?import', '?vite-wasm-instance', '?vite-wasm-instance&import']) {
  test(`private assets and their symlinks stay denied with ${suffix || 'no query'}`, async ({
    request,
  }) => {
    const file = resolve('.signals/test-private/privacy-probe.wasm');
    const link = resolve('apps/corpus/privacy-probe.wasm');
    await mkdir('.signals/test-private', { recursive: true });
    const canary = Buffer.from('private-asset-canary');
    // Valid WASM with an inert custom section: parsing must not create a Vite
    // error overlay that would mask later ordinary browser interactions.
    await writeFile(
      file,
      Buffer.concat([Buffer.from([0, 97, 115, 109, 1, 0, 0, 0, 0, canary.length + 1, 0]), canary]),
    );
    await symlink(file, link);
    try {
      for (const url of [`/signals-ai/@fs${file}`, '/signals-ai/privacy-probe.wasm']) {
        const response = await request.get(url + suffix);
        expect(response.status(), url + suffix).toBe(403);
        expect(await response.text()).not.toContain('private-asset-canary');
      }
    } finally {
      await unlink(link);
      await unlink(file);
    }
  });
}

test('a local user saves an ordinary question without writing evidence artifacts', async ({
  page,
  request,
}) => {
  await page.goto('./?view=Search');
  await page.getByLabel('Find something useful', { exact: true }).fill('toilet dye');
  await page.getByText('Search options', { exact: true }).click();
  await page.getByText('Save this question', { exact: true }).click();
  const reply = page.waitForResponse(
    (r) => r.url().endsWith('/__signals/api/question') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Save question locally' }).click();
  await expect(page.getByText(/^Question saved privately/)).toBeVisible();
  const body = (await (await reply).json()) as { id: string };
  expect(body.id).toMatch(/^[a-f0-9-]+\.json$/);
  const file = `private-query-probe/${body.id}`;
  try {
    const value = JSON.parse(await readFile(file, 'utf8')) as {
      result: { question: string };
    };
    expect(value.result).toEqual({ question: 'toilet dye' });
  } finally {
    await unlink(file);
  }
  const denied = await request.post('__signals/api/question', {
    headers: { origin: 'https://example.com', 'content-type': 'application/json' },
    data: { question: 'Cross-origin write' },
  });
  expect(denied.status()).toBe(403);
  const customFile = resolve('private-query-probe/probe.json');
  await writeFile(customFile, '{"private":"custom query content"}');
  try {
    const blocked = await request.get(`/signals-ai/@fs${customFile}`);
    expect(blocked.status()).toBe(403);
    expect(await blocked.text()).not.toContain('custom query content');
  } finally {
    await unlink(customFile);
  }
  await mkdir('.signals/test-private', { recursive: true });
  const privateFile = resolve('.signals/test-private/query.json');
  await writeFile(privateFile, '{"private":"must never be served"}');
  try {
    const blocked = await request.get(`/signals-ai/@fs${privateFile}`);
    expect(blocked.status()).toBe(403);
    expect(await blocked.text()).not.toContain('must never be served');
  } finally {
    await unlink(privateFile);
  }
  await mkdir('.meta/context/local', { recursive: true });
  const contextFile = resolve('.meta/context/local/privacy-probe.json');
  await writeFile(contextFile, '{"private":"local authoring context"}');
  try {
    const blocked = await request.get(`/signals-ai/@fs${contextFile}`);
    expect(blocked.status()).toBe(403);
    expect(await blocked.text()).not.toContain('local authoring context');
  } finally {
    await unlink(contextFile);
  }
});
