import { test, expect } from '@playwright/test';

const id = process.env.HARNESS_EXECUTION_ID;
const title = `Hello,  World! ${id}`;
const slug = `hello-world-${id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`;

test('EAC-2: saved item appears in list with slug and its page shows the title', async ({ page }) => {
  await page.setExtraHTTPHeaders({ 'X-Acceptance-Criterion': 'EAC-2' });
  await page.goto(process.env.HARNESS_TARGET_WEB_URL);

  const input = page.getByTestId('eac-2-title-input');
  await expect(input).toBeVisible();
  await input.fill(title);
  const save = page.getByTestId('eac-2-save-button');
  await expect(save).toBeVisible();
  await save.click();

  const list = page.getByTestId('eac-2-saved-list');
  await expect(list).toBeVisible();
  const slugEl = list.getByTestId('eac-2-item-slug').filter({ hasText: slug });
  await expect(slugEl).toHaveCount(1);
  await expect(slugEl).toHaveText(slug);

  const link = list.getByTestId('eac-2-item-link').filter({ hasText: 'World' }).filter({ hasText: id });
  await expect(link).toBeVisible();
  await link.click();

  const heading = page.getByTestId('eac-2-item-title');
  await expect(heading).toBeVisible();
  await expect(heading).toHaveText(title.replace(/\s+/g, ' '));
});
