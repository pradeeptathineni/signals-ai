import { test, expect } from '@playwright/test';

test('plain answer is visibly unassessed, whole narrative can be found/reopened and citations assessed explicitly', async ({
  page,
}) => {
  const question =
    'answer receipt browser fixture ' +
    'background '.repeat(155) +
    'Required: never upload recordings and export CSV with explicit end times.';
  await page.goto('');
  await page
    .getByRole('complementary')
    .getByRole('button', { name: 'Search', exact: true })
    .click();
  await page.getByLabel('Find something useful', { exact: true }).fill(question);
  await page.getByRole('button', { name: 'Research online', exact: true }).click();
  await page.getByText('Research options', { exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Research method', exact: true })
    .selectOption('answer-first');
  await page.getByRole('button', { name: 'Start online research', exact: true }).click();
  const brief = page.getByRole('region', { name: 'Research brief', exact: true });
  await expect(brief).toContainText('Unassessed answer · Confidence: Unknown');
  await expect(brief).toContainText('aurora quill constellation');
  await expect(
    page.getByRole('button', { name: 'Assess this citation', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('complementary')
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  await page
    .getByLabel('Find something useful', { exact: true })
    .fill('"aurora quill constellation"');
  const finding = page
    .locator('.desk-finding')
    .filter({ hasText: 'answer receipt browser fixture' });
  await expect(finding).toHaveCount(1);
  await finding.getByRole('button', { name: 'Reopen complete answer', exact: true }).click();
  const evidence = page.getByRole('region', { name: 'Evidence panel' });
  await expect(evidence).toContainText('Complete answer · Unassessed · Confidence Unknown');
  await expect(evidence).toContainText('aurora quill constellation');
  await page.getByRole('button', { name: 'Close evidence', exact: true }).click();
  await finding.getByRole('button', { name: 'Review citations', exact: true }).click();
  await expect(brief).toContainText('aurora quill constellation');
  let selection: unknown;
  await page.route('**/__signals/api/capture', async (route) => {
    selection = route.request().postDataJSON();
    await route.fulfill({ status: 400, json: { code: 'selected_assessment_fixture_stopped' } });
  });
  await page.getByRole('button', { name: 'Assess this citation', exact: true }).click();
  await expect(
    page.getByText('selected_assessment_fixture_stopped', { exact: true }),
  ).toBeVisible();
  expect(selection).toMatchObject({
    query: question,
    method: 'native',
    captureUrls: ['https://example.com/tool#export'],
  });
  expect((selection as { assessmentOf: string }).assessmentOf).toMatch(/^[a-f0-9-]{36}$/);
});
