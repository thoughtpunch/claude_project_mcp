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
    await this.page.waitForLoadState('domcontentloaded', options);
  }

  async waitForNetworkIdle(options?: { timeout?: number }) {
    await this.page.waitForLoadState('networkidle', options);
  }

  // URL helpers
  get url(): string {
    return this.page.url();
  }

  async goto(url: string) {
    log.action('navigate', { url });
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
  }

  // Get raw page for advanced operations
  get rawPage(): Page {
    return this.page;
  }
}
