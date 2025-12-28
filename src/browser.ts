import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { log } from './utils/logger.js';
import path from 'path';
import os from 'os';

export interface BrowserConfig {
  headed?: boolean;
  slowMo?: number;
  userDataDir?: string;
  timeout?: number;
}

const DEFAULT_USER_DATA_DIR = path.join(os.homedir(), '.claude_project_mcp', 'chrome-profile');

// Singleton browser instance
let browserContext: BrowserContext | null = null;
let activePage: Page | null = null;

export function getConfig(): BrowserConfig {
  return {
    headed: process.env.HEADED !== 'false',  // Default to headed mode
    slowMo: process.env.SLOW_MO ? parseInt(process.env.SLOW_MO) : 0,
    userDataDir: process.env.CHROME_PROFILE || DEFAULT_USER_DATA_DIR,
    timeout: process.env.TIMEOUT ? parseInt(process.env.TIMEOUT) : 30000,
  };
}

export async function launchBrowser(): Promise<BrowserContext> {
  if (browserContext) {
    log.info('Reusing existing browser context');
    return browserContext;
  }

  const config = getConfig();

  log.info('Launching browser', {
    headed: config.headed,
    slowMo: config.slowMo,
    userDataDir: config.userDataDir,
  });

  // Use launchPersistentContext to maintain login state
  browserContext = await chromium.launchPersistentContext(config.userDataDir!, {
    headless: !config.headed,
    slowMo: config.slowMo,
    viewport: { width: 1280, height: 800 },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
    ],
  });

  // Set default timeout
  browserContext.setDefaultTimeout(config.timeout!);

  log.info('Browser launched successfully');
  return browserContext;
}

export async function getPage(): Promise<Page> {
  const context = await launchBrowser();

  if (activePage && !activePage.isClosed()) {
    return activePage;
  }

  // Get existing pages or create new one
  const pages = context.pages();
  if (pages.length > 0) {
    activePage = pages[0];
  } else {
    activePage = await context.newPage();
  }

  // If page is blank or on home, navigate to projects
  const url = activePage.url();
  if (!url || url === 'about:blank' || url === CLAUDE_BASE_URL || url.endsWith('/new')) {
    log.info('Navigating to projects page on startup');
    await activePage.goto(CLAUDE_PROJECTS_URL, { waitUntil: 'commit', timeout: 15000 }).catch(() => {});
    await activePage.waitForTimeout(2000);
  }

  return activePage;
}

export async function newPage(): Promise<Page> {
  const context = await launchBrowser();
  activePage = await context.newPage();
  return activePage;
}

export async function closeBrowser(): Promise<void> {
  if (browserContext) {
    log.info('Closing browser');
    await browserContext.close();
    browserContext = null;
    activePage = null;
  }
}

export async function navigateTo(url: string): Promise<Page> {
  const page = await getPage();
  log.info('Navigating to', { url });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  return page;
}

export const CLAUDE_BASE_URL = 'https://claude.ai';
export const CLAUDE_PROJECTS_URL = `${CLAUDE_BASE_URL}/projects`;

// Individual project URL (note: singular /project/)
export function getProjectUrl(projectId: string): string {
  return `${CLAUDE_BASE_URL}/project/${projectId}`;
}

// API endpoint pattern for projects list
// Full URL: https://claude.ai/api/organizations/{org_id}/projects?include_harmony_projects=true&limit=30
export const PROJECTS_API_PATTERN = /\/api\/organizations\/[^/]+\/projects/;

export async function navigateToClaude(): Promise<Page> {
  return navigateTo(CLAUDE_BASE_URL);
}

export async function navigateToProjects(): Promise<Page> {
  return navigateTo(CLAUDE_PROJECTS_URL);
}

// Check if we're logged in
export async function isLoggedIn(): Promise<boolean> {
  const page = await getPage();
  const config = getConfig();

  try {
    // Look for signs of being logged in (user menu, etc.)
    await page.waitForSelector('[data-testid="user-menu"], [aria-label*="account" i], [aria-label*="profile" i]', {
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}
