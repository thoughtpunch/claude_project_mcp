#!/usr/bin/env node
/**
 * Test script to validate selectors against live Claude.ai
 *
 * Usage:
 *   npm run test-selectors
 *   HEADED=true npm run test-selectors  # Run with visible browser
 */

import { getPage, navigateToClaude, navigateToProjects, closeBrowser } from './browser.js';
import { validateSelectors, formatValidationResults, markSelectorsValidated } from './selectors.js';
import { takeScreenshot } from './utils/screenshot.js';

async function main() {
  console.log('Claude Project MCP - Selector Validator\n');
  console.log('========================================\n');

  try {
    // Launch browser and navigate to Claude
    console.log('Launching browser...');
    const page = await getPage();

    console.log('Navigating to Claude.ai...');
    await navigateToClaude();

    // Wait a bit for page to fully load
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    // Take a screenshot of the initial state
    const screenshotPath = await takeScreenshot(page, 'test-selectors-initial');
    console.log(`Screenshot saved: ${screenshotPath.path}\n`);

    // Check if logged in
    const isLoggedIn = await page.locator('[data-testid="user-menu"], [aria-label*="account" i], button:has-text("Sign up")').first()
      .waitFor({ timeout: 5000 })
      .then(() => true)
      .catch(() => false);

    if (!isLoggedIn) {
      console.log('⚠️  Warning: May not be logged in. Some selectors may not work.\n');
    }

    // Validate selectors on main page
    console.log('Validating selectors on main Claude.ai page...\n');
    let results = await validateSelectors(page);
    console.log(formatValidationResults(results));

    // Navigate to projects and validate there too
    console.log('\n\nNavigating to projects page...');
    await navigateToProjects();
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    const projectsScreenshot = await takeScreenshot(page, 'test-selectors-projects');
    console.log(`Screenshot saved: ${projectsScreenshot.path}\n`);

    console.log('Validating selectors on projects page...\n');
    results = await validateSelectors(page);
    console.log(formatValidationResults(results));

    // Update last validated timestamp
    markSelectorsValidated();
    console.log('\n✅ Updated selectors.json with validation timestamp');

  } catch (error) {
    console.error('\n❌ Error during validation:', error);
  } finally {
    await closeBrowser();
    console.log('\nDone.');
  }
}

main();
