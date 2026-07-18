import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const SHOT_DIR = path.resolve('screenshots');

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`), fullPage: true });
}

async function waitDesktop(page: Page) {
  await expect(page.getByTestId('desktop-root')).toBeVisible({ timeout: 30_000 });
  // Dismiss welcome notification if present
  await page.waitForTimeout(400);
}

async function launchFromDock(page: Page, name: string) {
  await page.getByRole('button', { name: `Launch ${name}` }).click();
}

test.describe('WebOS desktop', () => {
  test.beforeEach(async ({ page }) => {
    // Fresh storage each test — wait for IDB delete to finish
    await page.goto('/');
    await page.evaluate(async () => {
      const del = (name: string) =>
        new Promise<void>((resolve) => {
          try {
            const req = indexedDB.deleteDatabase(name);
            req.onsuccess = () => resolve();
            req.onerror = () => resolve();
            req.onblocked = () => resolve();
          } catch {
            resolve();
          }
        });
      await del('webos-store');
      await del('webos-fs-handles');
      try {
        localStorage.clear();
      } catch {
        /* ignore */
      }
    });
    await page.reload();
    await waitDesktop(page);
  });

  test('loads desktop and captures screenshot', async ({ page }) => {
    await expect(page.getByTestId('desktop-root')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Launch Finder' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Launch Calculator' })).toBeVisible();
    await shot(page, '01-desktop');
  });

  test('opens, focuses, minimizes, maximizes, and closes windows', async ({ page }) => {
    await launchFromDock(page, 'Calculator');
    await expect(page.getByTestId('calculator')).toBeVisible();
    await shot(page, '02-calculator');

    // Maximize
    await page.getByRole('button', { name: 'Maximize' }).first().click();
    await page.waitForTimeout(200);

    // Minimize
    await page.getByRole('button', { name: 'Minimize' }).first().click();
    await expect(page.getByTestId('calculator')).toHaveCount(0);

    // Restore via dock
    await launchFromDock(page, 'Calculator');
    await expect(page.getByTestId('calculator')).toBeVisible();

    // Close
    await page.getByRole('button', { name: 'Close' }).first().click();
    await expect(page.getByTestId('calculator')).toHaveCount(0);
  });

  test('calculator input and arithmetic', async ({ page }) => {
    await launchFromDock(page, 'Calculator');
    await expect(page.getByTestId('calc-display')).toHaveText('0');
    await page.getByTestId('calc-1').click();
    await page.getByTestId('calc-2').click();
    await page.getByTestId('calc-add').click();
    await page.getByTestId('calc-3').click();
    await page.getByTestId('calc-eq').click();
    await expect(page.getByTestId('calc-display')).toHaveText('15');
  });

  test('terminal commands', async ({ page }) => {
    await launchFromDock(page, 'Terminal');
    await expect(page.getByTestId('terminal')).toBeVisible();
    const input = page.getByTestId('terminal-input');
    await input.fill('help');
    await input.press('Enter');
    await expect(page.getByTestId('terminal')).toContainText('available commands');

    await input.fill('ls');
    await input.press('Enter');
    await expect(page.getByTestId('terminal')).toContainText('Documents');

    await input.fill('pwd');
    await input.press('Enter');
    await expect(page.getByTestId('terminal')).toContainText('/');

    await input.fill('mkdir E2EFolder');
    await input.press('Enter');
    await input.fill('touch E2EFile.txt');
    await input.press('Enter');
    await input.fill('ls');
    await input.press('Enter');
    await expect(page.getByTestId('terminal')).toContainText('E2EFolder');
    await expect(page.getByTestId('terminal')).toContainText('E2EFile.txt');
    await shot(page, '03-terminal');
  });

  test('finder file creation and text editing', async ({ page }) => {
    await launchFromDock(page, 'Finder');
    await expect(page.getByTestId('finder')).toBeVisible();
    await page.getByTestId('finder-new-file').click();
    await page.waitForTimeout(300);
    // Rename input may be focused
    const renameInput = page.locator('input').filter({ hasText: '' }).first();
    if (await renameInput.isVisible()) {
      await renameInput.fill('MyNote.txt');
      await renameInput.press('Enter');
    }
    await shot(page, '04-finder');

    // Open text editor from dock and save a file
    await launchFromDock(page, 'TextEdit');
    await expect(page.getByTestId('text-editor')).toBeVisible();
    await page.getByTestId('editor-textarea').fill('Hello from Playwright e2e test.');
    await page.getByTestId('editor-save').click();
    await page.waitForTimeout(400);
    await shot(page, '05-text-editor');
  });

  test('image viewer zoom and navigation', async ({ page }) => {
    await launchFromDock(page, 'Photos');
    await expect(page.getByTestId('image-viewer')).toBeVisible();
    await expect(page.getByTestId('img-display')).toBeVisible();
    await page.getByTestId('img-next').click();
    await page.getByTestId('img-zoom-in').click();
    await page.getByTestId('img-rotate').click();
    await shot(page, '06-image-viewer');
  });

  test('settings change appearance and wallpaper', async ({ page }) => {
    await launchFromDock(page, 'Settings');
    await expect(page.getByTestId('settings')).toBeVisible();
    await page.getByTestId('settings-appearance-light').click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    await page.getByTestId('settings-wallpaper-ocean').click();
    await page.getByTestId('settings-accent-purple').click();
    await page.getByTestId('settings-reduced-motion').check();
    await shot(page, '07-settings');

    // Persist across reload
    await page.reload();
    await waitDesktop(page);
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    // Reduced motion class
    await expect(page.locator('html')).toHaveClass(/reduce-motion/);
  });

  test('persistence of files after reload', async ({ page }) => {
    await launchFromDock(page, 'Terminal');
    const input = page.getByTestId('terminal-input');
    await input.fill('touch PersistMe.txt');
    await input.press('Enter');
    await input.fill('ls');
    await input.press('Enter');
    await expect(page.getByTestId('terminal')).toContainText('PersistMe.txt');

    // Allow IndexedDB persist transaction to commit
    await page.waitForTimeout(500);
    await page.reload();
    await waitDesktop(page);
    await launchFromDock(page, 'Terminal');
    const input2 = page.getByTestId('terminal-input');
    await input2.fill('ls');
    await input2.press('Enter');
    await expect(page.getByTestId('terminal')).toContainText('PersistMe.txt');
  });

  test('spotlight opens and launches app', async ({ page }) => {
    await page.keyboard.press('Control+Space');
    await expect(page.getByPlaceholder('Search apps and files…')).toBeVisible();
    await page.getByPlaceholder('Search apps and files…').fill('calc');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('calculator')).toBeVisible({ timeout: 10_000 });
  });

  test('about window', async ({ page }) => {
    await page.getByRole('button', { name: 'About WebOS' }).click();
    await expect(page.getByTestId('about')).toBeVisible();
    await shot(page, '08-about');
  });

  test('tablet viewport layout', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.reload();
    await waitDesktop(page);
    await expect(page.getByTestId('desktop-root')).toBeVisible();
    await launchFromDock(page, 'Finder');
    await expect(page.getByTestId('finder')).toBeVisible();
    await shot(page, '09-tablet');
  });
});
