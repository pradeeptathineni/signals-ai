import { expect, test } from '@playwright/test';
test('built same-origin question saves, repeat visits and protected mutations', async ({
  page,
  request,
}) => {
  await page.goto('./?view=Search');
  await page.getByLabel('Find something useful', { exact: true }).fill('portable evidence');
  await page.getByText('Search options', { exact: true }).click();
  await page.getByText('Save this question', { exact: true }).click();
  const save = page.waitForResponse(
    (r) => r.url().endsWith('/api/question') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Save question locally' }).click();
  const reply = await save;
  expect(reply.status()).toBe(200);
  expect(await reply.json()).toMatchObject({ saved: true });
  await page.reload();
  await page.getByText('Search options', { exact: true }).click();
  await page.getByText('Save this question', { exact: true }).click();
  await page.getByRole('button', { name: 'Save question locally' }).click();
  await expect(page.getByText(/^Question saved privately/)).toBeVisible();
  const session = (await (await request.get('__signals/api/session')).json()) as { token: string };
  const headers = { 'x-signals-token': session.token };
  expect(
    (await request.post('__signals/api/question', { data: { question: 'blocked' } })).status(),
  ).toBe(403);
  expect(
    (
      await request.post('__signals/api/question', {
        headers: { ...headers, Origin: 'https://attacker.example' },
        data: { question: 'blocked' },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.get('__signals/api/session', { headers: { Host: 'attacker.example' } })
    ).status(),
  ).toBe(403);
  expect((await request.get('.signals/settings.json')).status()).toBe(404);
  expect(
    (
      await request.post('__signals/api/question', {
        headers,
        data: { question: 'valid', arbitrary: 'field' },
      })
    ).status(),
  ).toBe(400);
  await page.getByRole('button', { name: 'Library', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Your library' })).toBeVisible();
});
