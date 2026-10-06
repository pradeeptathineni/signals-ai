import { expect, test } from '@playwright/test';
import { readFile, unlink, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
test('a local user saves an ordinary question without writing evidence artifacts', async ({
  page,
  request,
}) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Corpus', exact: true }).click();
  await page.getByLabel('Search keywords').fill('toilet dye');
  const reply = page.waitForResponse(
    (r) => r.url().endsWith('/__signals/query') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Save question locally' }).click();
  await expect(page.getByText(/^Question saved privately/)).toBeVisible();
  const body = (await (await reply).json()) as { id: string };
  expect(body.id).toMatch(/^[a-f0-9-]+\.json$/);
  const file = `private-query-probe/${body.id}`;
  try {
    const value = JSON.parse(await readFile(file, 'utf8')) as {
      result: { question: string; items: Array<{ id: string }> };
    };
    expect(value.result.question).toBe('toilet dye');
    expect(value.result.items.map((o: { id: string }) => o.id)).toEqual(['option-water-leaks']);
  } finally {
    await unlink(file);
  }
  const denied = await request.post('__signals/query', {
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
});
