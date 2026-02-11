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

    // If there is a summary with tabs, verify the language toggle tabs are present
    const hasLangTabs = await page.locator('.lang-tab').count();
    if (hasSummary > 0 && hasLangTabs > 0) {
      await expect(page.locator('.lang-tab[data-lang="zh"]')).toBeVisible();
      await expect(page.locator('.lang-tab[data-lang="en"]')).toBeVisible();
      await expect(page.locator('.lang-tab[data-lang="zh"]')).toHaveText('中文');
      await expect(page.locator('.lang-tab[data-lang="en"]')).toHaveText('English');
    }
  });

  test('language tabs switch content', async ({ page }) => {
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

      const hasLangTabs = await page.locator('.lang-tab').count();
      if (hasLangTabs > 0) {
        found = true;

        // Chinese tab should be active by default, Chinese summary visible, English hidden
        const zhPanel = page.locator('#summary-zh');
        const enPanel = page.locator('#summary-en');
        await expect(zhPanel).toBeVisible();
        await expect(enPanel).toBeHidden();

        // Capture Chinese summary text
        const zhText = await zhPanel.textContent();

        // Click English tab
        await page.locator('.lang-tab[data-lang="en"]').click();

        // Now English should be visible and Chinese hidden
        await expect(enPanel).toBeVisible();
        await expect(zhPanel).toBeHidden();

        // English content should differ from Chinese content
        const enText = await enPanel.textContent();
        expect(enText).not.toBe(zhText);

        // Click Chinese tab again to verify it switches back
        await page.locator('.lang-tab[data-lang="zh"]').click();
        await expect(zhPanel).toBeVisible();
        await expect(enPanel).toBeHidden();

        break;
      }
    }

    // Skip if no posts have summaries yet (e.g. before first generation)
    test.skip(!found, 'No posts with bilingual summaries found');
  });

  test('post links do not open in new tab', async ({ page }) => {
    await page.goto(`${BASE}/`);

    const firstPostLink = page.locator('li a').first();
    const target = await firstPostLink.getAttribute('target');
    expect(target).toBeNull();
  });
});
