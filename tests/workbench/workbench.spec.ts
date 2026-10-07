import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

test('server-owned replay supports evidence, private notes, manual saves, inbox and reopening', async ({
  page,
  request,
}) => {
  await page.goto('');
  await page.getByLabel('Research question').fill('approved public replay');
  await page.getByRole('button', { name: 'Start search', exact: true }).click();
  await expect(page.locator('.entity-card')).toHaveCount(2);
  const first = page.locator('.entity-card').first();
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
  await page
    .locator('.entity-card')
    .first()
    .getByText('Private note and feedback', { exact: true })
    .click();
  await expect(page.getByRole('textbox', { name: /^Note for/ }).first()).toHaveValue(
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
