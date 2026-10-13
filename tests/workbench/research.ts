import type { Page } from '@playwright/test';

export async function openResearchOptions(page: Page, question: string) {
  await page.goto('');
  await page
    .getByRole('complementary')
    .getByRole('button', { name: 'Search', exact: true })
    .click();
  await page.getByLabel('Find something useful', { exact: true }).fill(question);
  await page.getByRole('button', { name: 'Research online', exact: true }).click();
  await page.getByText('Research options', { exact: true }).click();
}
