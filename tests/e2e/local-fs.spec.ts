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
  await page.waitForTimeout(400);
}

async function unlock(page: Page) {
  const lock = page.getByTestId('lock-screen');
  await lock.waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByTestId('lock-password').fill('WebOS-Test-Password-123');
  await page.getByRole('button', { name: 'Unlock WebOS' }).click();
  await waitDesktop(page);
}

async function launchFromDock(page: Page, name: string) {
  await page.getByRole('button', { name: `Launch ${name}` }).click();
}

async function mountDemo(page: Page, writeEnabled = false) {
  await page.waitForFunction(() => {
    return Boolean((window as unknown as { __webosTest?: unknown }).__webosTest);
  }, { timeout: 15_000 });
  const result = await page.evaluate(async (write) => {
    const api = (window as unknown as { __webosTest?: { mountDemoFolder: (w?: boolean) => Promise<unknown> } })
      .__webosTest;
    if (!api) return { ok: false, error: 'no test api' };
    return api.mountDemoFolder(write);
  }, writeEnabled);
  return result as { ok: boolean; value?: { id: string; name: string }; error?: string };
}

test.describe('Local-first filesystem', () => {
  test.beforeEach(async ({ page }) => {
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
    await unlock(page);
  });

  test('mounts mocked directory and navigates folders', async ({ page }) => {
    await launchFromDock(page, 'Finder');
    await expect(page.getByTestId('finder')).toBeVisible();
    await expect(page.getByTestId('finder-connect-folder')).toBeVisible();

    const mount = await mountDemo(page, false);
    expect(mount.ok).toBeTruthy();

    // Click the mounted location in sidebar
    await page.getByTestId('finder-mount-test-demo-mount').click();
    await expect(page.getByTestId('finder-item-readme.txt')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('finder-item-images')).toBeVisible();
    await expect(page.getByTestId('finder-item-videos')).toBeVisible();

    // Navigate into images
    await page.getByTestId('finder-item-images').dblclick();
    await expect(page.getByTestId('finder-item-banner.svg')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('finder-breadcrumbs')).toContainText('images');

    // List view + sort control present
    await page.getByTestId('finder-view-list').click();
    await expect(page.getByTestId('finder-sort')).toBeVisible();
    await page.getByTestId('finder-refresh').click();

    await shot(page, '10-finder-local-mount');
  });

  test('image preview opens from mounted folder', async ({ page }) => {
    await launchFromDock(page, 'Finder');
    await mountDemo(page);
    await page.getByTestId('finder-mount-test-demo-mount').click();
    await page.getByTestId('finder-item-images').dblclick();
    await expect(page.getByTestId('finder-item-banner.svg')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('finder-item-banner.svg').dblclick();

    await expect(page.getByTestId('preview')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('preview-image')).toBeVisible();
    await page.getByTestId('preview-zoom-in').click();
    await page.getByTestId('preview-rotate').click();
    await page.getByTestId('preview-fit').click();
    await page.getByTestId('preview-actual').click();
    await shot(page, '11-preview-local-image');
  });

  test('video player UI loads for mounted video', async ({ page }) => {
    await launchFromDock(page, 'Finder');
    await mountDemo(page);
    await page.getByTestId('finder-mount-test-demo-mount').click();
    await page.getByTestId('finder-item-videos').dblclick();
    await expect(page.getByTestId('finder-item-sample.webm')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('finder-item-sample.webm').dblclick();

    await expect(page.getByTestId('video-player')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('video-play-pause')).toBeVisible();
    await expect(page.getByTestId('video-seek')).toBeVisible();
    await expect(page.getByTestId('video-volume')).toBeVisible();
    await expect(page.getByTestId('video-speed')).toBeVisible();
    await expect(page.getByTestId('video-mute')).toBeVisible();
    await expect(page.getByTestId('video-fullscreen')).toBeVisible();
    // Empty sample may show decode error — UI still present
    await page.getByTestId('video-play-pause').click();
    await shot(page, '12-video-player');
  });

  test('Quick Look opens with Space and closes with Escape', async ({ page }) => {
    await launchFromDock(page, 'Finder');
    await expect(page.getByTestId('finder')).toBeVisible();
    const mount = await mountDemo(page);
    expect(mount.ok).toBeTruthy();

    await page.getByTestId('finder-mount-test-demo-mount').click();
    await expect(page.getByTestId('finder-item-readme.txt')).toBeVisible({ timeout: 10_000 });

    // Focus the content area so Space does not activate a toolbar button
    await page.getByTestId('finder-content').click({ position: { x: 8, y: 8 } });
    await page.getByTestId('finder-item-readme.txt').click();
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur?.();
    });
    await page.keyboard.press('Space');
    await expect(page.getByTestId('quick-look')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('quick-look-text')).toContainText('Hello from a mounted');
    await shot(page, '13-quick-look');

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('quick-look')).toHaveCount(0);

    // Space again then close via button
    await page.getByTestId('finder-item-readme.txt').click();
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur?.();
    });
    await page.keyboard.press('Space');
    await expect(page.getByTestId('quick-look')).toBeVisible();
    await page.getByTestId('quick-look-close').click();
    await expect(page.getByTestId('quick-look')).toHaveCount(0);
  });

  test('permission-required state shows Grant Access', async ({ page }) => {
    await launchFromDock(page, 'Finder');
    const mount = await mountDemo(page);
    expect(mount.ok).toBeTruthy();

    await page.evaluate(async () => {
      const api = (window as unknown as {
        __webosTest?: {
          setMountPermission: (id: string, state: string) => Promise<unknown>;
        };
      }).__webosTest;
      await api?.setMountPermission('test-demo-mount', 'denied');
    });

    await page.getByTestId('finder-mount-test-demo-mount').click();
    // Either error panel or grant button
    const grant = page.getByTestId('finder-request-permission').or(page.getByTestId('finder-error-grant'));
    await expect(grant.first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('finder')).toContainText(/Permission|permission|Grant/i);
    await shot(page, '14-permission-required');
  });

  test('read-only mount blocks new file UI', async ({ page }) => {
    await launchFromDock(page, 'Finder');
    await mountDemo(page, false);
    await page.getByTestId('finder-mount-test-demo-mount').click();
    await expect(page.getByTestId('finder-item-readme.txt')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('finder-new-file')).toBeDisabled();
    await expect(page.getByTestId('finder-toggle-write')).toContainText(/Read-only/i);
  });
});
