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

  test('language toggle navigates between Chinese and English versions', async ({ page }) => {
    await page.goto(`${BASE}/`);

    // Collect hrefs from visible post links before navigating away
    const postLinks = page.locator('ol:not(.hidden) li a');
    const count = Math.min(await postLinks.count(), 10);
    const hrefs: string[] = [];
    for (let i = 0; i < count; i++) {
      const href = await postLinks.nth(i).getAttribute('href');
      if (href) hrefs.push(href);
    }
    let found = false;

    for (const href of hrefs) {
      await page.goto(href);
      await expect(page).toHaveURL(/\/post\//);

      // Check if a language toggle link (not just a span) exists
      const langToggleLink = page.locator('a.lang-toggle');
      const hasToggle = await langToggleLink.count();
      if (hasToggle > 0) {
        found = true;

        // On the Chinese page, the toggle should show "EN"
        await expect(langToggleLink).toHaveText('EN');

        // Click to go to the English version
        await langToggleLink.click();
        await expect(page).toHaveURL(/\/en\/post\//);

        // On the English page, the toggle should show the Chinese indicator
        const langToggleLinkEn = page.locator('a.lang-toggle');
        await expect(langToggleLinkEn).toHaveText('中');

        // Click back to Chinese version
        await langToggleLinkEn.click();
        await expect(page).toHaveURL(/\/post\/[a-f0-9-]+/);
        // Make sure it is NOT on the /en/ path
        expect(page.url()).not.toMatch(/\/en\/post\//);

        break;
      }
    }

    // Skip if no posts have summaries yet (e.g. before first generation)
    test.skip(!found, 'No posts with language toggle found');
  });

  test('post links do not open in new tab', async ({ page }) => {
    await page.goto(`${BASE}/`);

    const firstPostLink = page.locator('li a').first();
    const target = await firstPostLink.getAttribute('target');
    expect(target).toBeNull();
  });
});
