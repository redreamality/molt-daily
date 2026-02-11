import { test, expect } from '@playwright/test';

const BASE = '/molt-daily';

test.describe('Post detail page', () => {
  test('clicking a post title navigates to the detail page', async ({ page }) => {
    await page.goto(`${BASE}/`);

    // Get the first post link
    const firstPostLink = page.locator('li a').first();
    const postTitle = await firstPostLink.textContent();
    expect(postTitle).toBeTruthy();

    // The link should point to an internal /post/ URL
    const href = await firstPostLink.getAttribute('href');
    expect(href).toMatch(/\/molt-daily\/post\/[a-f0-9-]+/);

    // Click and verify navigation
    await firstPostLink.click();
    await expect(page).toHaveURL(/\/post\/[a-f0-9-]+/);

    // Verify detail page content
    await expect(page.locator('article h1')).toContainText(postTitle!.trim());
    await expect(page.locator('text=points')).toBeVisible();
    await expect(page.locator('a:has-text("Back to list")')).toBeVisible();
    await expect(page.locator('a:has-text("View original on Moltbook")')).toBeVisible();
  });

  test('detail page has back link that returns to list', async ({ page }) => {
    await page.goto(`${BASE}/`);

    // Navigate to a post
    await page.locator('li a').first().click();
    await expect(page).toHaveURL(/\/post\//);

    // Click back link
    await page.locator('a:has-text("Back to list")').click();
    await expect(page).toHaveURL(/\/molt-daily\/?$/);
  });

  test('detail page shows article content or fallback', async ({ page }) => {
    await page.goto(`${BASE}/`);
    await page.locator('li a').first().click();
    await expect(page).toHaveURL(/\/post\//);

    // Should have either prose-molt (summary) or fallback content
    const hasSummary = await page.locator('.prose-molt').count();
    const hasFallback = await page.locator('.whitespace-pre-wrap').count();
    expect(hasSummary + hasFallback).toBeGreaterThan(0);
  });

  test('post links do not open in new tab', async ({ page }) => {
    await page.goto(`${BASE}/`);

    const firstPostLink = page.locator('li a').first();
    const target = await firstPostLink.getAttribute('target');
    expect(target).toBeNull();
  });
});
