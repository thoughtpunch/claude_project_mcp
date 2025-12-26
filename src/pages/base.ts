import { Page } from 'playwright';
import {
  findElement,
  findElements,
  clickElement,
  fillElement,
  typeInElement,
  getElementText,
  elementExists,
  waitForElementToDisappear,
} from '../selectors.js';
import { takeScreenshot, takeErrorScreenshot, withScreenshotOnError } from '../utils/screenshot.js';
import { log } from '../utils/logger.js';

export abstract class BasePage {
  constructor(protected page: Page) {}

  // Selector helpers (delegate to selector engine)
  protected async find(selectorPath: string, options?: { timeout?: number }) {
    return findElement(this.page, selectorPath, options);
  }

  protected async findAll(selectorPath: string, options?: { timeout?: number }) {
    return findElements(this.page, selectorPath, options);
  }

  protected async click(selectorPath: string, options?: { timeout?: number }) {
    return clickElement(this.page, selectorPath, options);
  }

  protected async fill(selectorPath: string, text: string, options?: { timeout?: number; clear?: boolean }) {
    return fillElement(this.page, selectorPath, text, options);
  }

  protected async type(selectorPath: string, text: string, options?: { timeout?: number; delay?: number }) {
    return typeInElement(this.page, selectorPath, text, options);
  }

  protected async getText(selectorPath: string, options?: { timeout?: number }) {
    return getElementText(this.page, selectorPath, options);
  }

  protected async exists(selectorPath: string, options?: { timeout?: number }) {
    return elementExists(this.page, selectorPath, options);
  }

  protected async waitForDisappear(selectorPath: string, options?: { timeout?: number }) {
    return waitForElementToDisappear(this.page, selectorPath, options);
  }

  // Screenshot helpers
  async screenshot(label?: string) {
    return takeScreenshot(this.page, label);
  }

  async screenshotOnError(context: string) {
    return takeErrorScreenshot(this.page, context);
  }

  protected async withScreenshot<T>(actionName: string, action: () => Promise<T>): Promise<T> {
    return withScreenshotOnError(this.page, actionName, action);
  }

  // Common waits
  async waitForNavigation(options?: { timeout?: number }) {
    // Use commit which is fastest and most reliable
    try {
      await this.page.waitForLoadState('domcontentloaded', { timeout: options?.timeout || 5000 });
    } catch {
      // If load state times out, just continue - page may already be loaded
    }
  }

  async waitForNetworkIdle(options?: { timeout?: number }) {
    try {
      await this.page.waitForLoadState('networkidle', { timeout: options?.timeout || 5000 });
    } catch {
      // If network idle times out, just continue
    }
  }

  // URL helpers
  get url(): string {
    return this.page.url();
  }

  async goto(url: string) {
    log.action('navigate', { url });
    // Use 'commit' which fires earliest - just wait for navigation to start
    // Then we'll use waitForDomStable to ensure content is ready
    await this.page.goto(url, { waitUntil: 'commit', timeout: 30000 });
  }

  // Get raw page for advanced operations
  get rawPage(): Page {
    return this.page;
  }

  // Scroll to load all lazy-loaded content
  async scrollToLoadAll(options?: { maxScrolls?: number; scrollDelay?: number }): Promise<void> {
    const { maxScrolls = 20, scrollDelay = 300 } = options || {};

    let previousHeight = 0;
    let scrollCount = 0;

    while (scrollCount < maxScrolls) {
      const currentHeight = await this.page.evaluate(() => document.body.scrollHeight);

      if (currentHeight === previousHeight) {
        // No new content loaded, we're done
        break;
      }

      previousHeight = currentHeight;

      // Scroll to bottom
      await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await this.page.waitForTimeout(scrollDelay);

      scrollCount++;
    }

    // Scroll back to top
    await this.page.evaluate(() => window.scrollTo(0, 0));
  }

  // Wait for DOM to stabilize (no new elements being added)
  async waitForDomStable(options?: { timeout?: number; checkInterval?: number }): Promise<void> {
    const { timeout = 5000, checkInterval = 200 } = options || {};
    const startTime = Date.now();

    let previousCount = 0;

    while (Date.now() - startTime < timeout) {
      const currentCount = await this.page.evaluate(() => document.querySelectorAll('*').length);

      if (currentCount === previousCount) {
        return; // DOM is stable
      }

      previousCount = currentCount;
      await this.page.waitForTimeout(checkInterval);
    }
  }
}
