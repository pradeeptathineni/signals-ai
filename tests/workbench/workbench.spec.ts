import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { loadEntities } from '../../packages/corpus/src/search-store.js';

test('duplicate Corpus identities send the selected store for check and refresh', async ({
  page,
}) => {
  const [record] = await loadEntities();
  if (!record) throw new Error('public_replay_fixture_missing');
  // Frontend boundary fixture; backend scope/storage guards have separate HTTP regressions.
  await page.route('**/__signals/api/corpus', (route) => route.fulfill({ json: [record] }));
  await page.route('**/__signals/api/private-corpus', (route) => route.fulfill({ json: [record] }));
  const selections: { id: string; destination: string }[] = [];
  await page.route('**/__signals/api/primary-check', async (route) => {
    selections.push(route.request().postDataJSON());
    await route.fulfill({ json: { status: 'unchanged', reason: 'Scope boundary fixture.' } });
  });
  await page.route('**/__signals/api/refresh', async (route) => {
    selections.push(route.request().postDataJSON());
    await route.fulfill({ status: 400, json: { code: 'scope_boundary_fixture_stopped' } });
  });
  await page.goto('');
  await page.getByRole('button', { name: 'Corpus', exact: true }).click();
  const privateCard = page
    .locator('.entity-card')
    .filter({ has: page.getByText('Private Corpus', { exact: true }) });
  const publicCard = page
    .locator('.entity-card')
    .filter({ has: page.getByText('Public Corpus', { exact: true }) });
  await expect(privateCard).toHaveCount(1);
  await expect(publicCard).toHaveCount(1);
  await privateCard.getByRole('button', { name: 'Check primary source without AI' }).click();
  await expect(page.getByText(/Scope boundary fixture/)).toBeVisible();
  await privateCard
    .getByRole('button', { name: 'Research changes and independent evidence' })
    .click();
  await expect(page.getByText('scope_boundary_fixture_stopped', { exact: true })).toBeVisible();
  await publicCard.getByRole('button', { name: 'Check primary source without AI' }).click();
  expect(selections).toEqual([
    { id: record.entity.id, destination: 'private' },
    { id: record.entity.id, destination: 'private' },
    { id: record.entity.id, destination: 'public' },
  ]);
  const ids = await page
    .locator('[id]')
    .evaluateAll((elements) => elements.map((element) => element.id));
  expect(new Set(ids).size).toBe(ids.length);
});

test('server-owned replay supports evidence, private notes, manual saves, inbox and reopening', async ({
  page,
  request,
}) => {
  await page.goto('');
  await page.getByLabel('Research question').fill('approved public replay');
  await page.getByRole('button', { name: 'Start search', exact: true }).click();
  await expect(page.locator('.entity-card')).toHaveCount(2);
  const first = page.locator('.entity-card').first();
  const annotatedName = await first.getByRole('heading', { level: 2 }).innerText();
  await first.getByText('Score, limits and sources', { exact: true }).click();
  await first.locator('details details summary').click();
  await first
    .getByRole('button', { name: /^Preview evidence for/ })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await first.getByText('Private note and feedback', { exact: true }).click();
  await first.getByRole('textbox', { name: /^Note for/ }).fill('Private browser annotation');
  await first.getByRole('combobox', { name: /^Feedback for/ }).selectOption('useful');
  await first.getByRole('button', { name: 'Save private note' }).click();
  await expect(page.getByText('Private note and feedback saved.')).toBeVisible();
  await first.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Keep selected in inbox' }).click();
  await expect(page.getByText(/^Promising inbox \(/)).toBeVisible();
  await page.getByRole('button', { name: /^Save selected/ }).click();
  await expect(first.getByText(/· Saved/)).toBeVisible();
  await page.reload();
  await page.getByText(/^Promising inbox \(/).click();
  await page
    .getByRole('button', { name: /^Reopen/ })
    .first()
    .click();
  await expect(page.locator('.entity-card')).toHaveCount(2);
  // Current Corpus membership can reorder replay; the annotation belongs to an identity.
  const reopened = page
    .locator('.entity-card')
    .filter({ has: page.getByRole('heading', { level: 2, name: annotatedName, exact: true }) });
  await reopened.getByText('Private note and feedback', { exact: true }).click();
  await expect(reopened.getByRole('textbox', { name: /^Note for/ })).toHaveValue(
    'Private browser annotation',
  );
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
  }
  const blocked = await request.get('__signals/api/personal', {
    headers: { origin: 'https://evil.example' },
  });
  expect(blocked.status()).toBe(403);
});

test('source settings and owned cancellation remain usable', async ({ page }) => {
  await page.goto('');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByText('Configured acquisition and extraction providers', { exact: true }).click();
  await expect(page.getByText('searxng: unconfigured', { exact: true })).toBeVisible();
  await expect(page.getByText('last30days: unconfigured', { exact: true })).toBeVisible();
  await page.getByLabel('Source URL', { exact: true }).fill('https://example.com/feed');
  await page.getByLabel('Source name', { exact: true }).fill('Private followed feed');
  await page.getByRole('button', { name: 'Add followed source', exact: true }).click();
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Private followed feed' })).toBeVisible();
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByLabel('Research question').fill('cancellation fixture');
  await page.getByRole('button', { name: 'Start search', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByText(/Research cancelled/)).toBeVisible();
});

test('provisional leads are separate from final savable evidence', async ({ page }) => {
  await page.goto('');
  await page.getByLabel('Research question').fill('cancellation fixture');
  await page.getByRole('button', { name: 'Start search', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Provisional research leads' })).toBeVisible();
  await expect(page.locator('.entity-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Provisional research leads' })).not.toBeVisible();
  await expect(page.getByText(/Research cancelled/)).toBeVisible();
});
