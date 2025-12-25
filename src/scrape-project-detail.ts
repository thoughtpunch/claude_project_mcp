#!/usr/bin/env node
/**
 * Scrape a Claude.ai project detail page
 */

import { chromium } from 'playwright';
import path from 'path';
import os from 'os';
import { writeFileSync, mkdirSync, existsSync } from 'fs';

const DEFAULT_USER_DATA_DIR = path.join(os.homedir(), '.claude-project-mcp', 'chrome-profile');
const OUTPUT_DIR = path.join(process.cwd(), 'scraped');

// Use one of your actual project IDs
const PROJECT_ID = '019b42d8-d96d-76ec-a534-9a80f0d1ac06'; // The Human School

async function main() {
  console.log('Scraping project detail page...\n');

  const userDataDir = process.env.CHROME_PROFILE || DEFAULT_USER_DATA_DIR;

  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1400, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const page = context.pages()[0] || await context.newPage();

  try {
    // Navigate directly to project
    console.log(`1. Navigating to project ${PROJECT_ID}...`);
    await page.goto(`https://claude.ai/project/${PROJECT_ID}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    await page.waitForTimeout(4000);

    await page.screenshot({ path: path.join(OUTPUT_DIR, '03-project-chat.png'), fullPage: true });
    console.log('   Screenshot saved: 03-project-chat.png');

    // Scrape project chat page structure
    const chatPageData = await page.evaluate(() => {
      const data: any = {
        url: window.location.href,
        buttons: [],
        inputs: [],
        textareas: [],
        contentEditables: [],
        dataTestIds: [],
        ariaLabels: [],
        links: [],
        tabs: [],
        allElements: []
      };

      // Buttons with text
      document.querySelectorAll('button').forEach(el => {
        const text = el.textContent?.trim();
        if (text && text.length < 100) {
          data.buttons.push({
            text: text.substring(0, 50),
            ariaLabel: el.getAttribute('aria-label'),
            dataTestId: el.getAttribute('data-testid'),
            className: el.className?.substring(0, 80),
          });
        }
      });

      // Inputs
      document.querySelectorAll('input').forEach(el => {
        data.inputs.push({
          type: el.getAttribute('type'),
          placeholder: el.getAttribute('placeholder'),
          ariaLabel: el.getAttribute('aria-label'),
          dataTestId: el.getAttribute('data-testid'),
          name: el.getAttribute('name'),
        });
      });

      // Textareas
      document.querySelectorAll('textarea').forEach(el => {
        data.textareas.push({
          placeholder: el.getAttribute('placeholder'),
          ariaLabel: el.getAttribute('aria-label'),
          dataTestId: el.getAttribute('data-testid'),
        });
      });

      // Content editable (chat input)
      document.querySelectorAll('[contenteditable="true"]').forEach(el => {
        data.contentEditables.push({
          tag: el.tagName,
          className: el.className?.substring(0, 100),
          role: el.getAttribute('role'),
          ariaLabel: el.getAttribute('aria-label'),
          placeholder: el.getAttribute('data-placeholder'),
        });
      });

      // All data-testid elements
      document.querySelectorAll('[data-testid]').forEach(el => {
        data.dataTestIds.push({
          testId: el.getAttribute('data-testid'),
          tag: el.tagName,
          text: el.textContent?.trim().substring(0, 40),
        });
      });

      // All aria-labels
      document.querySelectorAll('[aria-label]').forEach(el => {
        data.ariaLabels.push({
          label: el.getAttribute('aria-label'),
          tag: el.tagName,
          role: el.getAttribute('role'),
        });
      });

      // Links in main content
      document.querySelectorAll('main a, [role="main"] a').forEach(el => {
        data.links.push({
          href: el.getAttribute('href'),
          text: el.textContent?.trim().substring(0, 50),
        });
      });

      // Tab-like elements
      document.querySelectorAll('[role="tab"], [role="tablist"] > *').forEach(el => {
        data.tabs.push({
          text: el.textContent?.trim(),
          ariaSelected: el.getAttribute('aria-selected'),
          role: el.getAttribute('role'),
        });
      });

      return data;
    });

    writeFileSync(path.join(OUTPUT_DIR, '03-project-chat.json'), JSON.stringify(chatPageData, null, 2));
    console.log('   Data saved: 03-project-chat.json');

    // Now try to find project settings/knowledge buttons
    console.log('\n2. Looking for project settings or knowledge buttons...');

    // Look for settings gear or similar
    const settingsButtons = await page.locator('button:has-text("Settings"), button[aria-label*="settings" i], button[aria-label*="gear" i]').all();
    console.log(`   Found ${settingsButtons.length} potential settings buttons`);

    // Look for knowledge/files related buttons
    const knowledgeButtons = await page.locator('button:has-text("Knowledge"), button:has-text("Files"), button:has-text("Add content")').all();
    console.log(`   Found ${knowledgeButtons.length} potential knowledge buttons`);

    // Try clicking on project knowledge if available
    const projectKnowledgeBtn = page.locator('button:has-text("Project knowledge")').first();
    if (await projectKnowledgeBtn.count() > 0) {
      console.log('\n3. Clicking Project knowledge button...');
      await projectKnowledgeBtn.click();
      await page.waitForTimeout(2000);

      await page.screenshot({ path: path.join(OUTPUT_DIR, '04-project-knowledge.png'), fullPage: true });
      console.log('   Screenshot saved: 04-project-knowledge.png');

      const knowledgeData = await page.evaluate(() => {
        const data: any = {
          url: window.location.href,
          buttons: [],
          fileItems: [],
          dataTestIds: [],
        };

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

        // Look for file list items
        document.querySelectorAll('[class*="file"], [class*="document"], [data-testid*="file"]').forEach(el => {
          data.fileItems.push({
            text: el.textContent?.trim().substring(0, 100),
            className: el.className?.substring(0, 80),
          });
        });

        document.querySelectorAll('[data-testid]').forEach(el => {
          data.dataTestIds.push({
            testId: el.getAttribute('data-testid'),
            tag: el.tagName,
          });
        });

        return data;
      });

      writeFileSync(path.join(OUTPUT_DIR, '04-project-knowledge.json'), JSON.stringify(knowledgeData, null, 2));
      console.log('   Data saved: 04-project-knowledge.json');
    }

    // Go back to chat and look for chat-specific elements
    console.log('\n4. Looking for chat input structure...');
    await page.goto(`https://claude.ai/project/${PROJECT_ID}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    await page.waitForTimeout(3000);

    // Get the chat input area HTML
    const chatInputHtml = await page.evaluate(() => {
      const chatInput = document.querySelector('[data-testid="chat-input"]') ||
                       document.querySelector('.ProseMirror')?.parentElement?.parentElement ||
                       document.querySelector('[contenteditable="true"]')?.parentElement?.parentElement;
      return chatInput ? chatInput.outerHTML.substring(0, 10000) : 'Not found';
    });

    writeFileSync(path.join(OUTPUT_DIR, '05-chat-input-html.html'), chatInputHtml);
    console.log('   Chat input HTML saved: 05-chat-input-html.html');

    // Look for message elements
    const messagesHtml = await page.evaluate(() => {
      // Try to find the messages container
      const container = document.querySelector('[class*="conversation"]') ||
                       document.querySelector('[role="log"]') ||
                       document.querySelector('main');

      if (!container) return 'Not found';

      // Get message-like elements
      const messages = container.querySelectorAll('[class*="message"], [data-testid*="message"]');
      if (messages.length > 0) {
        return Array.from(messages).slice(0, 3).map(m => m.outerHTML).join('\n\n---\n\n');
      }

      return container.innerHTML.substring(0, 20000);
    });

    writeFileSync(path.join(OUTPUT_DIR, '05-messages-html.html'), messagesHtml);
    console.log('   Messages HTML saved: 05-messages-html.html');

    console.log('\n✅ Scraping complete!');

  } finally {
    await context.close();
  }
}

main().catch(console.error);
