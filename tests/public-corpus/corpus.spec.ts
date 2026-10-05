import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { loadPublicCorpus } from '../../packages/seed/src/public-corpus.js';
import { filterPublicOptions } from '../../packages/domain/src/public-corpus.js';
import { parsePublicIndex } from '../../packages/domain/src/public-index.js';

test('human and machine find the same real public options with combined filters', async ({
  page,
}) => {
  const { options } = await loadPublicCorpus();
  await page.goto('');
  await expect(page.locator('.finding')).toHaveCount(options.length);
  await page.getByLabel('Search keywords').fill('water meter');
  await page.getByRole('combobox', { name: 'Domain', exact: true }).selectOption('Household');
  await page.getByLabel('Signal type').selectOption('practices');
  await page.getByLabel('Source kind').selectOption('guidance');
  const ids = await page
    .locator('.finding')
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-option-id')));
  expect(ids).toEqual(
    filterPublicOptions(options, {
      query: 'water meter',
      type: 'practices',
      category: 'Household',
      sourceClass: 'guidance',
    }).map((o) => o.id),
  );
  await expect(page.getByRole('status')).toContainText('1 of');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download these results' }).click();
  const download = await downloadEvent;
  const stream = await download.createReadStream();
  const parts = [];
  for await (const part of stream) parts.push(Buffer.from(part));
  const downloaded: unknown = JSON.parse(Buffer.concat(parts).toString());
  if (!downloaded || typeof downloaded !== 'object' || !('items' in downloaded))
    throw new Error('Invalid result export');
  expect(parsePublicIndex(downloaded.items).map((o) => o.id)).toEqual(ids);
  await page.getByLabel('GitHub-hosted options').check();
  await expect(page.getByRole('heading', { name: 'No matching options' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.locator('.finding')).toHaveCount(options.length);
});

test('compares supported scope and limits, with keyboard access and responsive reflow', async ({
  page,
}) => {
  await page.goto('');
  await expect(page.locator('.finding').first()).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to findings' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#results')).toBeFocused();
  await page.getByRole('combobox', { name: 'Domain', exact: true }).selectOption('Development');
  await page.getByLabel('Signal type').selectOption('practices');
  const checks = page.locator('.compare-control input');
  await checks.nth(0).check();
  await checks.nth(1).check();
  await expect(page.getByRole('heading', { name: 'Compare selected options' })).toBeVisible();
  await expect(page.locator('.comparison-grid article')).toHaveCount(2);
  await expect(checks.nth(2)).toBeDisabled();
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
    if (process.env.SIGNALS_SCREENSHOT_DIR) {
      await mkdir(process.env.SIGNALS_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({
        path: join(process.env.SIGNALS_SCREENSHOT_DIR, `public-corpus-${width}.png`),
        fullPage: true,
      });
    }
  }
  await page.getByRole('button', { name: 'Clear comparison' }).click();
  await expect(checks.nth(2)).toBeEnabled();
});

test('shows a useful loading error and recovers without model or local service calls', async ({
  page,
}) => {
  await page.route('**/corpus.json', (route) =>
    route.fulfill({ status: 503, body: 'unavailable' }),
  );
  await page.goto('');
  await expect(page.getByRole('alert')).toContainText('could not be loaded');
  await page.unroute('**/corpus.json');
  await page.getByRole('button', { name: 'Retry loading' }).click();
  await expect(page.locator('.finding').first()).toBeVisible();
});

test('rejects corrupt public JSON before rendering and can recover', async ({ page }) => {
  await page.route('**/corpus.json', (route) =>
    route.fulfill({ contentType: 'application/json', body: '[{}]' }),
  );
  await page.goto('');
  await expect(page.getByRole('alert')).toContainText('invalid format');
  await page.unroute('**/corpus.json');
  await page.getByRole('button', { name: 'Retry loading' }).click();
  await expect(page.locator('.finding').first()).toBeVisible();
});
