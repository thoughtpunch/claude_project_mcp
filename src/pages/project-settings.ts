import { Page } from 'playwright';
import { BasePage } from './base.js';
import { log } from '../utils/logger.js';

export interface ProjectMemory {
  raw: string;
  sections: {
    purposeAndContext?: string;
    currentState?: string;
    onTheHorizon?: string;
    keyLearnings?: string;
    approachAndPatterns?: string;
    toolsAndResources?: string;
    [key: string]: string | undefined;
  };
  lastUpdated?: string;
}

export interface ProjectDetails {
  name: string;
  description?: string;
  instructions?: string;
  memory?: ProjectMemory;
  fileCount: number;
}

export class ProjectSettingsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  // Get the project memory/context content
  async getMemory(): Promise<ProjectMemory> {
    return this.withScreenshot('get-memory', async () => {
      log.action('getting project memory');

      // Look for the Memory section
      const memorySection = this.page.locator('section:has-text("Memory"), div:has-text("Memory"):has(button)').first();

      let rawContent = '';
      const sections: ProjectMemory['sections'] = {};

      if (await memorySection.count() > 0) {
        // Try to expand if collapsed
        const expandButton = memorySection.locator('button[aria-expanded="false"]').first();
        if (await expandButton.count() > 0) {
          await expandButton.click();
          await this.page.waitForTimeout(300);
        }

        // Get the full text content
        rawContent = await memorySection.innerText().catch(() => '');

        // Parse sections by common headers
        const sectionPatterns = [
          { key: 'purposeAndContext', pattern: /Purpose & context\s*([\s\S]*?)(?=Current state|On the horizon|Key learnings|Approach & patterns|Tools & resources|Last updated|$)/i },
          { key: 'currentState', pattern: /Current state\s*([\s\S]*?)(?=On the horizon|Key learnings|Approach & patterns|Tools & resources|Last updated|$)/i },
          { key: 'onTheHorizon', pattern: /On the horizon\s*([\s\S]*?)(?=Key learnings|Approach & patterns|Tools & resources|Last updated|$)/i },
          { key: 'keyLearnings', pattern: /Key learnings & principles\s*([\s\S]*?)(?=Approach & patterns|Tools & resources|Last updated|$)/i },
          { key: 'approachAndPatterns', pattern: /Approach & patterns\s*([\s\S]*?)(?=Tools & resources|Last updated|$)/i },
          { key: 'toolsAndResources', pattern: /Tools & resources\s*([\s\S]*?)(?=Last updated|$)/i },
        ];

        for (const { key, pattern } of sectionPatterns) {
          const match = rawContent.match(pattern);
          if (match && match[1]) {
            sections[key] = match[1].trim();
          }
        }
      }

      // Try to get last updated
      let lastUpdated: string | undefined;
      const lastUpdatedMatch = rawContent.match(/Last updated\s*(.*?)(?:\n|$)/i);
      if (lastUpdatedMatch) {
        lastUpdated = lastUpdatedMatch[1].trim();
      }

      log.action('got project memory', {
        rawLength: rawContent.length,
        sectionCount: Object.keys(sections).length
      });

      return {
        raw: rawContent,
        sections,
        lastUpdated,
      };
    });
  }

  // Get the project instructions
  async getInstructions(): Promise<string> {
    return this.withScreenshot('get-instructions', async () => {
      log.action('getting project instructions');

      // Look for Instructions section
      const instructionsSection = this.page.locator('section:has-text("Instructions"), div:has-text("Instructions"):has(button)').first();

      if (await instructionsSection.count() > 0) {
        // Click to expand/edit if needed
        const editButton = this.page.locator('button[aria-label="Edit Instructions"]').first();
        if (await editButton.count() > 0) {
          await editButton.click();
          await this.page.waitForTimeout(500);

          // Look for textarea or contenteditable in the dialog/form
          const textarea = this.page.locator('[role="dialog"] textarea, [role="dialog"] [contenteditable="true"]').first();
          if (await textarea.count() > 0) {
            const content = await textarea.inputValue().catch(() => '') ||
                           await textarea.innerText().catch(() => '');

            // Close dialog
            await this.page.keyboard.press('Escape');
            await this.page.waitForTimeout(300);

            return content;
          }
        }

        // Fallback: just get the text content
        const content = await instructionsSection.innerText().catch(() => '');
        return content.replace(/^Instructions\s*/i, '').trim();
      }

      return '';
    });
  }

  // Update project instructions
  async setInstructions(instructions: string): Promise<void> {
    return this.withScreenshot('set-instructions', async () => {
      log.action('setting project instructions', { length: instructions.length });

      // Click edit instructions button
      const editButton = this.page.locator('button[aria-label="Edit Instructions"]').first();
      if (await editButton.count() === 0) {
        // Try clicking the instructions section to open editor
        const instructionsSection = this.page.locator('section:has-text("Instructions"), div:has-text("Instructions")').first();
        if (await instructionsSection.count() > 0) {
          await instructionsSection.click();
          await this.page.waitForTimeout(500);
        }
      } else {
        await editButton.click();
        await this.page.waitForTimeout(500);
      }

      // Find the textarea/editor
      const textarea = this.page.locator('[role="dialog"] textarea, [role="dialog"] [contenteditable="true"], textarea[placeholder*="instruction" i]').first();

      if (await textarea.count() > 0) {
        // Clear and fill
        await textarea.click();
        await this.page.keyboard.press('Meta+A');
        await this.page.keyboard.press('Backspace');

        const tagName = await textarea.evaluate(el => el.tagName);
        if (tagName === 'TEXTAREA') {
          await textarea.fill(instructions);
        } else {
          await this.page.keyboard.type(instructions, { delay: 5 });
        }

        // Save
        const saveButton = this.page.locator('[role="dialog"] button:has-text("Save"), button:has-text("Done")').first();
        if (await saveButton.count() > 0) {
          await saveButton.click();
          await this.page.waitForTimeout(500);
        } else {
          await this.page.keyboard.press('Escape');
        }

        log.action('instructions updated');
      } else {
        throw new Error('Could not find instructions editor');
      }
    });
  }

  // Update/add to project memory (this might open a memory editor)
  async updateMemory(content: string, section?: string): Promise<void> {
    return this.withScreenshot('update-memory', async () => {
      log.action('updating project memory', { contentLength: content.length, section });

      // Look for memory edit button or section
      const memorySection = this.page.locator('section:has-text("Memory"), div:has-text("Memory"):has(button)').first();

      if (await memorySection.count() > 0) {
        // Try to find edit button
        const editButton = memorySection.locator('button[aria-label*="edit" i], button:has(svg)').first();
        if (await editButton.count() > 0) {
          await editButton.click();
          await this.page.waitForTimeout(500);
        } else {
          // Click the section itself
          await memorySection.click();
          await this.page.waitForTimeout(500);
        }

        // Find editor
        const editor = this.page.locator('[role="dialog"] textarea, [role="dialog"] [contenteditable="true"]').first();
        if (await editor.count() > 0) {
          await editor.click();

          if (section) {
            // Append to specific section - find and position cursor
            await this.page.keyboard.press('Meta+End'); // Go to end
          } else {
            // Replace all
            await this.page.keyboard.press('Meta+A');
            await this.page.keyboard.press('Backspace');
          }

          await this.page.keyboard.type(content, { delay: 5 });

          // Save
          const saveButton = this.page.locator('[role="dialog"] button:has-text("Save")').first();
          if (await saveButton.count() > 0) {
            await saveButton.click();
          } else {
            await this.page.keyboard.press('Escape');
          }

          log.action('memory updated');
        } else {
          throw new Error('Could not find memory editor');
        }
      } else {
        throw new Error('Memory section not found');
      }
    });
  }

  // Get all project details in one call
  async getProjectDetails(): Promise<ProjectDetails> {
    return this.withScreenshot('get-project-details', async () => {
      log.action('getting project details');

      // Get project name
      const nameEl = this.page.locator('h1').first();
      const name = await nameEl.innerText().catch(() => 'Unknown');

      // Get description (usually right after h1)
      const descEl = this.page.locator('h1 + p, h1 ~ p').first();
      const description = await descEl.innerText().catch(() => undefined);

      // Get memory
      const memory = await this.getMemory();

      // Get instructions
      const instructions = await this.getInstructions();

      // Count files
      const fileCount = await this.page.locator('[data-testid="file-thumbnail"]').count();

      return {
        name,
        description,
        instructions: instructions || undefined,
        memory,
        fileCount,
      };
    });
  }
}
