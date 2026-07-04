import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function postSessionJson<T>(page: Page, url: string) {
  return page.evaluate(async (targetUrl) => {
    const response = await fetch(targetUrl, {
      method: 'POST',
      credentials: 'include',
      headers: {
        accept: 'application/json',
      },
    });

    const text = await response.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }

    return {
      json,
      ok: response.ok,
      status: response.status,
      text,
    };
  }, url) as Promise<{ json?: T; ok: boolean; status: number; text: string }>;
}

async function getAccessToken(page: Page) {
  const refreshResponse = await postSessionJson<{ token?: string }>(
    page,
    'http://localhost:3080/api/auth/refresh',
  );
  expect(refreshResponse.ok).toBeTruthy();
  expect(refreshResponse.json?.token).toBeTruthy();
  return refreshResponse.json?.token as string;
}

async function applyAccessToken(page: Page, accessToken: string) {
  await page.evaluate((token) => {
    window.dispatchEvent(new CustomEvent('tokenUpdated', { detail: token }));
  }, accessToken);
}

test.describe('Landing suite', () => {
  test('Landing title', async ({ page }) => {
    await page.goto('/', { timeout: 5000 });
    const accessToken = await getAccessToken(page);
    await applyAccessToken(page, accessToken);
    await page.goto('/', { timeout: 5000 });

    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Message input' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Select a model' })).toBeVisible();
  });

  test('Create Conversation', async ({ page }) => {
    await page.goto('/c/new', { timeout: 5000 });
    const accessToken = await getAccessToken(page);
    await applyAccessToken(page, accessToken);
    await page.goto('/c/new', { timeout: 5000 });

    await expect(page).toHaveURL(/\/c\/new$/);
    await expect(page.getByRole('link', { name: 'New chat' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Message input' })).toBeVisible();
  });
});
