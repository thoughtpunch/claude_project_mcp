import { Page, Locator, ElementHandle } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';
import { log } from './utils/logger.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SELECTORS_PATH = path.join(__dirname, '..', 'selectors.json');

interface SelectorEntry {
  description: string;
  strategies: string[];
}

interface SelectorCategory {
  [key: string]: SelectorEntry;
}

interface SelectorsConfig {
  _meta: {
    description: string;
    lastValidated: string | null;
    tips: string[];
  };
  [category: string]: SelectorCategory | any;
}

let selectorsCache: SelectorsConfig | null = null;

// Load selectors from JSON file
export function loadSelectors(): SelectorsConfig {
  if (selectorsCache) {
    return selectorsCache;
  }

  try {
    const content = readFileSync(SELECTORS_PATH, 'utf-8');
    selectorsCache = JSON.parse(content);
    log.debug('Selectors loaded from file');
    return selectorsCache!;
  } catch (error) {
    log.error('Failed to load selectors.json', { error: String(error) });
    throw new Error(`Failed to load selectors.json: ${error}`);
  }
}

// Reload selectors (useful after manual edits)
export function reloadSelectors(): SelectorsConfig {
  selectorsCache = null;
  return loadSelectors();
}

// Get a selector entry by path (e.g., "chat.messageInput")
export function getSelectorEntry(selectorPath: string): SelectorEntry {
  const selectors = loadSelectors();
  const parts = selectorPath.split('.');

  let current: any = selectors;
  for (const part of parts) {
    if (current[part] === undefined) {
      throw new Error(`Selector not found: ${selectorPath}`);
    }
    current = current[part];
  }

  if (!current.strategies || !Array.isArray(current.strategies)) {
    throw new Error(`Invalid selector entry at ${selectorPath}: missing strategies array`);
  }

  return current as SelectorEntry;
}

// Get all strategies for a selector
export function getStrategies(selectorPath: string): string[] {
  return getSelectorEntry(selectorPath).strategies;
}

// The main function: find an element using fallback strategies
export async function findElement(
  page: Page,
  selectorPath: string,
  options: { timeout?: number; state?: 'attached' | 'visible' | 'hidden' } = {}
): Promise<Locator> {
  const entry = getSelectorEntry(selectorPath);
  const { timeout = 10000, state = 'visible' } = options;

  log.debug(`Finding element: ${selectorPath}`, { description: entry.description });

  const errors: string[] = [];

  for (const strategy of entry.strategies) {
    try {
      const locator = page.locator(strategy).first();

      // Wait for the element with a shorter timeout per strategy
      const perStrategyTimeout = Math.min(timeout / entry.strategies.length, 5000);

      await locator.waitFor({ state, timeout: perStrategyTimeout });

      log.selector('found', selectorPath, strategy, true);
      return locator;
    } catch (error) {
      log.selector('failed', selectorPath, strategy, false);
      errors.push(`  - "${strategy}": ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // All strategies failed - provide helpful error message
  const errorMessage = [
    `Failed to find element: ${selectorPath}`,
    `Description: ${entry.description}`,
    `Tried ${entry.strategies.length} strategies:`,
    ...errors,
    '',
    `To fix: Edit selectors.json and update the "${selectorPath}" entry`,
    `Tip: Run 'npm run inspect' to explore the page interactively`,
  ].join('\n');

  throw new Error(errorMessage);
}

// Find multiple elements
export async function findElements(
  page: Page,
  selectorPath: string,
  options: { timeout?: number } = {}
): Promise<Locator> {
  const entry = getSelectorEntry(selectorPath);
  const { timeout = 10000 } = options;

  for (const strategy of entry.strategies) {
    try {
      const locator = page.locator(strategy);
      // Check if at least one element exists
      await locator.first().waitFor({ state: 'attached', timeout: timeout / entry.strategies.length });

      const count = await locator.count();
      log.debug(`Found ${count} elements for ${selectorPath} using strategy: ${strategy}`);
      return locator;
    } catch {
      continue;
    }
  }

  throw new Error(`No elements found for: ${selectorPath}`);
}

// Click an element
export async function clickElement(
  page: Page,
  selectorPath: string,
  options: { timeout?: number } = {}
): Promise<void> {
  const locator = await findElement(page, selectorPath, options);
  log.action('click', { selector: selectorPath });
  await locator.click();
}

// Fill a text input
export async function fillElement(
  page: Page,
  selectorPath: string,
  text: string,
  options: { timeout?: number; clear?: boolean } = {}
): Promise<void> {
  const locator = await findElement(page, selectorPath, options);
  log.action('fill', { selector: selectorPath, textLength: text.length });

  if (options.clear) {
    await locator.clear();
  }
  await locator.fill(text);
}

// Type text (slower, character by character - useful for inputs that need events)
export async function typeInElement(
  page: Page,
  selectorPath: string,
  text: string,
  options: { timeout?: number; delay?: number } = {}
): Promise<void> {
  const locator = await findElement(page, selectorPath, options);
  log.action('type', { selector: selectorPath, textLength: text.length });
  await locator.pressSequentially(text, { delay: options.delay || 50 });
}

// Get text content
export async function getElementText(
  page: Page,
  selectorPath: string,
  options: { timeout?: number } = {}
): Promise<string> {
  const locator = await findElement(page, selectorPath, options);
  return await locator.innerText();
}

// Check if element exists (without throwing)
export async function elementExists(
  page: Page,
  selectorPath: string,
  options: { timeout?: number } = {}
): Promise<boolean> {
  try {
    await findElement(page, selectorPath, { ...options, timeout: options.timeout || 3000 });
    return true;
  } catch {
    return false;
  }
}

// Wait for element to disappear
export async function waitForElementToDisappear(
  page: Page,
  selectorPath: string,
  options: { timeout?: number } = {}
): Promise<void> {
  const entry = getSelectorEntry(selectorPath);
  const { timeout = 30000 } = options;

  // Try each strategy
  for (const strategy of entry.strategies) {
    try {
      await page.locator(strategy).first().waitFor({ state: 'hidden', timeout });
      return;
    } catch {
      continue;
    }
  }
}

// Validate all selectors on a page
export interface ValidationResult {
  selectorPath: string;
  description: string;
  found: boolean;
  workingStrategy: string | null;
  failedStrategies: string[];
}

export async function validateSelectors(
  page: Page,
  category?: string
): Promise<ValidationResult[]> {
  const selectors = loadSelectors();
  const results: ValidationResult[] = [];

  const categoriesToCheck = category
    ? { [category]: selectors[category] }
    : selectors;

  for (const [catName, catValue] of Object.entries(categoriesToCheck)) {
    if (catName === '_meta' || typeof catValue !== 'object') continue;

    for (const [selectorName, selectorValue] of Object.entries(catValue as SelectorCategory)) {
      if (!selectorValue.strategies) continue;

      const selectorPath = `${catName}.${selectorName}`;
      const result: ValidationResult = {
        selectorPath,
        description: selectorValue.description,
        found: false,
        workingStrategy: null,
        failedStrategies: [],
      };

      for (const strategy of selectorValue.strategies) {
        try {
          const locator = page.locator(strategy).first();
          await locator.waitFor({ state: 'attached', timeout: 2000 });
          result.found = true;
          result.workingStrategy = strategy;
          break;
        } catch {
          result.failedStrategies.push(strategy);
        }
      }

      results.push(result);
    }
  }

  return results;
}

// Save updated lastValidated timestamp
export function markSelectorsValidated(): void {
  const selectors = loadSelectors();
  selectors._meta.lastValidated = new Date().toISOString();
  writeFileSync(SELECTORS_PATH, JSON.stringify(selectors, null, 2));
  log.info('Updated selectors.json lastValidated timestamp');
}

// Get a summary of selector health
export function formatValidationResults(results: ValidationResult[]): string {
  const found = results.filter(r => r.found);
  const missing = results.filter(r => !r.found);

  let output = `Selector Validation Results\n`;
  output += `============================\n`;
  output += `Found: ${found.length}/${results.length}\n`;
  output += `Missing: ${missing.length}/${results.length}\n\n`;

  if (missing.length > 0) {
    output += `Missing Selectors (need fixing):\n`;
    output += `--------------------------------\n`;
    for (const r of missing) {
      output += `\n❌ ${r.selectorPath}\n`;
      output += `   Description: ${r.description}\n`;
      output += `   Tried: ${r.failedStrategies.join(', ')}\n`;
    }
  }

  if (found.length > 0) {
    output += `\nWorking Selectors:\n`;
    output += `------------------\n`;
    for (const r of found) {
      output += `✅ ${r.selectorPath} → ${r.workingStrategy}\n`;
    }
  }

  return output;
}
