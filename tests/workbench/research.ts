import type { Page } from '@playwright/test';

// Fresh typed question with the workbench method left untouched.
export async function openFreshResearch(page: Page, question: string) {
  await page.goto('');
  await page
    .getByRole('complementary')
    .getByRole('button', { name: 'Search', exact: true })
    .click();
  await page.getByLabel('Find something useful', { exact: true }).fill(question);
  await page.getByRole('button', { name: 'Research online', exact: true }).click();
}

// Scored workflows select evidence assessment explicitly; the fresh default is answer-first.
export async function openResearchOptions(page: Page, question: string) {
  await openFreshResearch(page, question);
  await selectEvidenceResearch(page);
}

export async function selectEvidenceResearch(page: Page) {
  const options = page.getByText('Research options', { exact: true });
  const details = options.locator('..');
  if (!(await details.evaluate((node) => (node as HTMLDetailsElement).open))) await options.click();
  await page.getByRole('combobox', { name: 'Research method', exact: true }).selectOption('native');
}
