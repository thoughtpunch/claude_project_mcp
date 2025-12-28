#!/usr/bin/env node
/**
 * Scrape Claude.ai page structure to help update selectors
 */

import { chromium } from 'playwright';
import path from 'path';
import os from 'os';
import { writeFileSync } from 'fs';

const DEFAULT_USER_DATA_DIR = path.join(os.homedir(), '.claude_project_mcp', 'chrome-profile');
const OUTPUT_DIR = path.join(process.cwd(), 'scraped');

async function main() {
  console.log('Scraping Claude.ai structure...\n');

  const userDataDir = process.env.CHROME_PROFILE || DEFAULT_USER_DATA_DIR;

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1400, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const page = context.pages()[0] || await context.newPage();

  // Create output directory
  const { mkdirSync, existsSync } = await import('fs');
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  try {
    // 1. Scrape home page
    console.log('1. Navigating to home page...');
    await page.goto('https://claude.ai', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);

    await page.screenshot({ path: path.join(OUTPUT_DIR, '01-home.png'), fullPage: true });

    // Get interesting elements
    const homeData = await page.evaluate(() => {
      const data: any = {
        url: window.location.href,
        buttons: [],
        inputs: [],
        links: [],
        dataTestIds: [],
        ariaLabels: [],
        contentEditables: [],
      };

      // Find all buttons
      document.querySelectorAll('button').forEach(el => {
        data.buttons.push({
          text: el.textContent?.trim().substring(0, 50),
          ariaLabel: el.getAttribute('aria-label'),
          dataTestId: el.getAttribute('data-testid'),
          className: el.className?.substring(0, 100),
        });
      });

      // Find all inputs
      document.querySelectorAll('input, textarea').forEach(el => {
        data.inputs.push({
          type: el.getAttribute('type'),
          placeholder: el.getAttribute('placeholder'),
          ariaLabel: el.getAttribute('aria-label'),
          dataTestId: el.getAttribute('data-testid'),
        });
      });

      // Find contenteditable elements
      document.querySelectorAll('[contenteditable="true"]').forEach(el => {
        data.contentEditables.push({
          tag: el.tagName,
          className: el.className?.substring(0, 100),
          role: el.getAttribute('role'),
          ariaLabel: el.getAttribute('aria-label'),
        });
      });

      // Find all data-testid attributes
      document.querySelectorAll('[data-testid]').forEach(el => {
        data.dataTestIds.push({
          testId: el.getAttribute('data-testid'),
          tag: el.tagName,
        });
      });

      // Find all aria-labels
      document.querySelectorAll('[aria-label]').forEach(el => {
        data.ariaLabels.push({
          label: el.getAttribute('aria-label'),
          tag: el.tagName,
          role: el.getAttribute('role'),
        });
      });

      // Find links with /project in href
      document.querySelectorAll('a[href*="project"]').forEach(el => {
        data.links.push({
          href: el.getAttribute('href'),
          text: el.textContent?.trim().substring(0, 50),
        });
      });

      return data;
    });

    writeFileSync(path.join(OUTPUT_DIR, '01-home.json'), JSON.stringify(homeData, null, 2));
    console.log('   Saved home page structure');

    // 2. Navigate to projects
    console.log('2. Navigating to projects...');
    await page.goto('https://claude.ai/projects', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);

    await page.screenshot({ path: path.join(OUTPUT_DIR, '02-projects.png'), fullPage: true });

    const projectsData = await page.evaluate(() => {
      const data: any = {
        url: window.location.href,
        projectLinks: [],
        buttons: [],
        dataTestIds: [],
        ariaLabels: [],
      };

      // Find project links
      document.querySelectorAll('a[href*="/project/"]').forEach(el => {
        data.projectLinks.push({
          href: el.getAttribute('href'),
          text: el.textContent?.trim().substring(0, 100),
          className: el.className?.substring(0, 100),
        });
      });

      // Find all buttons
      document.querySelectorAll('button').forEach(el => {
        const text = el.textContent?.trim();
        if (text && text.length < 50) {
          data.buttons.push({
            text,
            ariaLabel: el.getAttribute('aria-label'),
            dataTestId: el.getAttribute('data-testid'),
          });
        }
      });

      // Find all data-testid
      document.querySelectorAll('[data-testid]').forEach(el => {
        data.dataTestIds.push({
          testId: el.getAttribute('data-testid'),
          tag: el.tagName,
          text: el.textContent?.trim().substring(0, 30),
        });
      });

      // Aria labels
      document.querySelectorAll('[aria-label]').forEach(el => {
        data.ariaLabels.push({
          label: el.getAttribute('aria-label'),
          tag: el.tagName,
        });
      });

      return data;
    });

    writeFileSync(path.join(OUTPUT_DIR, '02-projects.json'), JSON.stringify(projectsData, null, 2));
    console.log('   Saved projects page structure');

    // 3. Click on first project if exists
    const firstProjectLink = await page.locator('a[href*="/project/"]').first();
    if (await firstProjectLink.count() > 0) {
      console.log('3. Opening first project...');
      await firstProjectLink.click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(3000);

      await page.screenshot({ path: path.join(OUTPUT_DIR, '03-project-detail.png'), fullPage: true });

      const projectDetailData = await page.evaluate(() => {
        const data: any = {
          url: window.location.href,
          buttons: [],
          inputs: [],
          textareas: [],
          contentEditables: [],
          dataTestIds: [],
          ariaLabels: [],
          tabs: [],
        };

        // Buttons
        document.querySelectorAll('button').forEach(el => {
          const text = el.textContent?.trim();
          if (text && text.length < 50) {
            data.buttons.push({
              text,
              ariaLabel: el.getAttribute('aria-label'),
              dataTestId: el.getAttribute('data-testid'),
            });
          }
        });

        // Inputs
        document.querySelectorAll('input').forEach(el => {
          data.inputs.push({
            type: el.getAttribute('type'),
            placeholder: el.getAttribute('placeholder'),
            name: el.getAttribute('name'),
            dataTestId: el.getAttribute('data-testid'),
          });
        });

        // Textareas
        document.querySelectorAll('textarea').forEach(el => {
          data.textareas.push({
            placeholder: el.getAttribute('placeholder'),
            name: el.getAttribute('name'),
            dataTestId: el.getAttribute('data-testid'),
          });
        });

        // Content editable (likely chat input)
        document.querySelectorAll('[contenteditable="true"]').forEach(el => {
          data.contentEditables.push({
            tag: el.tagName,
            className: el.className?.substring(0, 100),
            role: el.getAttribute('role'),
            parentClass: el.parentElement?.className?.substring(0, 100),
          });
        });

        // Tabs
        document.querySelectorAll('[role="tab"], [role="tablist"] button').forEach(el => {
          data.tabs.push({
            text: el.textContent?.trim(),
            ariaLabel: el.getAttribute('aria-label'),
            selected: el.getAttribute('aria-selected'),
          });
        });

        // Data test ids
        document.querySelectorAll('[data-testid]').forEach(el => {
          data.dataTestIds.push({
            testId: el.getAttribute('data-testid'),
            tag: el.tagName,
          });
        });

        // Aria labels
        document.querySelectorAll('[aria-label]').forEach(el => {
          data.ariaLabels.push({
            label: el.getAttribute('aria-label'),
            tag: el.tagName,
          });
        });

        return data;
      });

      writeFileSync(path.join(OUTPUT_DIR, '03-project-detail.json'), JSON.stringify(projectDetailData, null, 2));
      console.log('   Saved project detail structure');

      // 4. Get the chat area HTML specifically
      const chatHtml = await page.evaluate(() => {
        // Try to find the main chat/conversation area
        const possibleContainers = [
          document.querySelector('[class*="conversation"]'),
          document.querySelector('[class*="chat"]'),
          document.querySelector('[class*="message"]')?.parentElement?.parentElement,
          document.querySelector('main'),
        ];

        for (const container of possibleContainers) {
          if (container) {
            return container.outerHTML.substring(0, 50000);
          }
        }
        return document.body.innerHTML.substring(0, 50000);
      });

      writeFileSync(path.join(OUTPUT_DIR, '03-chat-area.html'), chatHtml);
      console.log('   Saved chat area HTML');
    }

    console.log('\n✅ Scraping complete! Check the ./scraped directory');
    console.log('   Files:');
    console.log('   - 01-home.png / .json');
    console.log('   - 02-projects.png / .json');
    console.log('   - 03-project-detail.png / .json');
    console.log('   - 03-chat-area.html');

  } finally {
    await context.close();
  }
}

main().catch(console.error);
