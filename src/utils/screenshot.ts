import { Page } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { log } from './logger.js';
import { mkdirSync, existsSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = path.join(__dirname, '..', '..', 'screenshots');

// Ensure screenshots directory exists
if (!existsSync(SCREENSHOTS_DIR)) {
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

export interface ScreenshotResult {
  path: string;
  timestamp: string;
}

function generateFilename(label: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeLabel = label.replace(/[^a-zA-Z0-9-_]/g, '_');
  return `${timestamp}_${safeLabel}.png`;
}

// Take a screenshot
export async function takeScreenshot(
  page: Page,
  label: string = 'screenshot'
): Promise<ScreenshotResult> {
  const filename = generateFilename(label);
  const filepath = path.join(SCREENSHOTS_DIR, filename);

  await page.screenshot({ path: filepath, fullPage: false });

  log.info('Screenshot saved', { path: filepath });

  return {
    path: filepath,
    timestamp: new Date().toISOString(),
  };
}

// Take a screenshot on error (includes more context in filename)
export async function takeErrorScreenshot(
  page: Page,
  errorContext: string
): Promise<ScreenshotResult> {
  return takeScreenshot(page, `error_${errorContext}`);
}

// Take a full-page screenshot
export async function takeFullPageScreenshot(
  page: Page,
  label: string = 'full-page'
): Promise<ScreenshotResult> {
  const filename = generateFilename(label);
  const filepath = path.join(SCREENSHOTS_DIR, filename);

  await page.screenshot({ path: filepath, fullPage: true });

  log.info('Full-page screenshot saved', { path: filepath });

  return {
    path: filepath,
    timestamp: new Date().toISOString(),
  };
}

// Wrapper to execute action with screenshot on failure
export async function withScreenshotOnError<T>(
  page: Page,
  actionName: string,
  action: () => Promise<T>
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    log.error(`Action failed: ${actionName}`, { error: String(error) });
    const screenshot = await takeErrorScreenshot(page, actionName);
    const enhancedError = new Error(
      `${error instanceof Error ? error.message : String(error)}\n\nScreenshot saved: ${screenshot.path}`
    );
    throw enhancedError;
  }
}

export function getScreenshotsDir(): string {
  return SCREENSHOTS_DIR;
}
