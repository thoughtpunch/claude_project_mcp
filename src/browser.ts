import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import RecaptchaPlugin from 'puppeteer-extra-plugin-recaptcha';
import type { BrowserContext, Page } from 'playwright';
import { log } from './utils/logger.js';
import path from 'path';
import os from 'os';

// Configure stealth plugin with all evasions enabled
const stealth = StealthPlugin();

// Configure recaptcha plugin (optional - needs 2captcha API key)
const recaptcha = RecaptchaPlugin({
  provider: {
    id: '2captcha',
    token: process.env.TWOCAPTCHA_TOKEN || '', // Set via env if needed
  },
  visualFeedback: true,
});

// Register plugins with chromium
chromium.use(stealth);
if (process.env.TWOCAPTCHA_TOKEN) {
  chromium.use(recaptcha);
}

export interface BrowserConfig {
  headed?: boolean;
  slowMo?: number;
  userDataDir?: string;
  timeout?: number;
  useRealProfile?: boolean;
}

// Real Chrome user data directories by platform
function getRealChromeDataDir(): string {
  const platform = os.platform();
  const home = os.homedir();

  switch (platform) {
    case 'darwin':
      // macOS: ~/Library/Application Support/Google/Chrome
      return path.join(home, 'Library', 'Application Support', 'Google', 'Chrome');
    case 'win32':
      // Windows: %LOCALAPPDATA%\Google\Chrome\User Data
      return path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'Google', 'Chrome', 'User Data');
    case 'linux':
      // Linux: ~/.config/google-chrome
      return path.join(home, '.config', 'google-chrome');
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

// Fallback isolated profile directory
const ISOLATED_PROFILE_DIR = path.join(os.homedir(), '.claude-project-mcp', 'chrome-profile');

// Singleton browser instance
let browserContext: BrowserContext | null = null;
let activePage: Page | null = null;

export function getConfig(): BrowserConfig {
  const useRealProfile = process.env.USE_REAL_CHROME_PROFILE !== 'false'; // Default to true

  return {
    headed: process.env.HEADED === 'true',
    slowMo: process.env.SLOW_MO ? parseInt(process.env.SLOW_MO) : 0,
    userDataDir: process.env.CHROME_PROFILE || (useRealProfile ? getRealChromeDataDir() : ISOLATED_PROFILE_DIR),
    timeout: process.env.TIMEOUT ? parseInt(process.env.TIMEOUT) : 30000,
    useRealProfile,
  };
}

export async function launchBrowser(): Promise<BrowserContext> {
  if (browserContext) {
    log.info('Reusing existing browser context');
    return browserContext;
  }

  const config = getConfig();

  log.info('Launching browser with stealth mode', {
    headed: config.headed,
    slowMo: config.slowMo,
    userDataDir: config.userDataDir,
    useRealProfile: config.useRealProfile,
    stealthEnabled: true,
  });

  // Comprehensive anti-detection arguments
  const args = [
    // Core stealth args
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',

    // Appear more like real Chrome
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',

    // Window management
    '--window-position=0,0',
    '--window-size=1920,1080',

    // Reduce fingerprinting vectors
    '--disable-background-networking',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-sync',

    // Networking
    '--disable-features=TranslateUI',
    '--disable-ipc-flooding-protection',

    // Minimize sandbox issues (use with caution)
    '--no-sandbox',
    '--disable-setuid-sandbox',
  ];

  // For true headless with stealth, use the new headless mode
  const headlessMode = config.headed ? false : 'new';

  browserContext = await chromium.launchPersistentContext(config.userDataDir!, {
    headless: headlessMode as any,
    slowMo: config.slowMo,
    viewport: { width: 1920, height: 1080 },
    args,

    // Additional stealth options
    ignoreDefaultArgs: ['--enable-automation'],

    // Realistic browser settings
    locale: 'en-US',
    timezoneId: 'America/New_York',

    // Permissions that a real user would have granted
    permissions: ['geolocation', 'notifications'],

    // Realistic user agent (matches real Chrome)
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',

    // Color scheme
    colorScheme: 'light',

    // Device scale factor
    deviceScaleFactor: 2,

    // Enable JavaScript
    javaScriptEnabled: true,

    // Accept downloads
    acceptDownloads: true,

    // Bypass CSP for better compatibility
    bypassCSP: true,
  });

  // Set default timeout
  browserContext.setDefaultTimeout(config.timeout!);

  // Add additional stealth patches to each new page
  browserContext.on('page', async (page) => {
    await applyStealthPatches(page);
  });

  // Apply patches to existing pages
  for (const page of browserContext.pages()) {
    await applyStealthPatches(page);
  }

  log.info('Browser launched successfully with stealth mode');
  return browserContext;
}

/**
 * Apply additional stealth patches that go beyond the plugin
 */
async function applyStealthPatches(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // Override webdriver property
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });

    // Override plugins to look more realistic
    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
        { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
      ],
    });

    // Override languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });

    // Override platform
    Object.defineProperty(navigator, 'platform', {
      get: () => 'MacIntel',
    });

    // Override hardwareConcurrency
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: () => 8,
    });

    // Override deviceMemory
    Object.defineProperty(navigator, 'deviceMemory', {
      get: () => 8,
    });

    // Override connection
    Object.defineProperty(navigator, 'connection', {
      get: () => ({
        effectiveType: '4g',
        rtt: 50,
        downlink: 10,
        saveData: false,
      }),
    });

    // Chrome-specific properties
    (window as any).chrome = {
      runtime: {},
      loadTimes: function() {},
      csi: function() {},
      app: {},
    };

    // Override permissions query
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters: any) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: Notification.permission } as PermissionStatus) :
        originalQuery(parameters)
    );

    // Fix iframe contentWindow access detection
    const originalContentWindow = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
    Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
      get: function() {
        const window = originalContentWindow?.get?.call(this);
        if (window) {
          try {
            // Try to access to test same-origin
            window.self;
          } catch (e) {
            // Cross-origin, return as-is
            return window;
          }
        }
        return window;
      },
    });
  });
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

// Export for potential recaptcha solving
export async function solveRecaptchas(page: Page): Promise<void> {
  if (process.env.TWOCAPTCHA_TOKEN) {
    try {
      await (page as any).solveRecaptchas();
    } catch (error) {
      log.warn('Failed to solve recaptcha', { error });
    }
  }
}
