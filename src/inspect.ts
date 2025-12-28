#!/usr/bin/env node
/**
 * Interactive inspection tool for debugging selectors
 *
 * Usage:
 *   npm run inspect
 *
 * This opens Claude.ai in a visible browser and pauses,
 * allowing you to use browser DevTools to inspect elements
 * and update selectors.json
 */

import { chromium } from 'playwright';
import * as readline from 'readline';
import path from 'path';
import os from 'os';

const DEFAULT_USER_DATA_DIR = path.join(os.homedir(), '.claude_project_mcp', 'chrome-profile');

async function main() {
  console.log('Claude Project MCP - Interactive Inspector\n');
  console.log('==========================================\n');
  console.log('This will open Claude.ai in a visible browser for debugging.\n');
  console.log('Tips:');
  console.log('  - Right-click elements → Inspect to find selectors');
  console.log('  - Look for data-testid attributes (most stable)');
  console.log('  - Update selectors.json with working selectors');
  console.log('  - Press Enter in this terminal to close the browser\n');

  const userDataDir = process.env.CHROME_PROFILE || DEFAULT_USER_DATA_DIR;

  console.log(`Using Chrome profile: ${userDataDir}\n`);

  // Launch browser in headed mode
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    slowMo: 100,
    viewport: { width: 1400, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const page = context.pages()[0] || await context.newPage();

  // Navigate to Claude.ai
  console.log('Navigating to Claude.ai...\n');
  await page.goto('https://claude.ai', { waitUntil: 'domcontentloaded' });

  // Add helper functions to the page console
  await page.evaluate(() => {
    // Helper to get a unique selector for an element
    (window as any).getSelector = (element: Element) => {
      if (element.getAttribute('data-testid')) {
        return `[data-testid="${element.getAttribute('data-testid')}"]`;
      }
      if (element.id) {
        return `#${element.id}`;
      }
      if (element.getAttribute('aria-label')) {
        return `[aria-label="${element.getAttribute('aria-label')}"]`;
      }
      // Fallback to generating a path
      const path: string[] = [];
      let current: Element | null = element;
      while (current && current !== document.body) {
        let selector = current.tagName.toLowerCase();
        if (current.className) {
          selector += '.' + current.className.trim().split(/\s+/).join('.');
        }
        path.unshift(selector);
        current = current.parentElement;
      }
      return path.join(' > ');
    };

    console.log('Helper functions available:');
    console.log('  getSelector(element) - Get a selector for an element');
    console.log('  Example: getSelector($0) - Get selector for currently selected element');
  });

  console.log('Browser is ready. Inspect the page to find selectors.\n');
  console.log('In DevTools Console, use getSelector($0) to get a selector for the selected element.\n');

  // Wait for user to press Enter
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  await new Promise<void>((resolve) => {
    rl.question('Press Enter to close the browser...', () => {
      rl.close();
      resolve();
    });
  });

  await context.close();
  console.log('\nBrowser closed. Remember to update selectors.json if you found new selectors!');
}

main().catch(console.error);
