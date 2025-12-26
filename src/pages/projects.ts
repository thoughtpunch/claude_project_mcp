import { Page, Response } from 'playwright';
import { BasePage } from './base.js';
import { log } from '../utils/logger.js';
import { CLAUDE_PROJECTS_URL, CLAUDE_BASE_URL, getProjectUrl, PROJECTS_API_PATTERN } from '../browser.js';

export interface ProjectInfo {
  id: string;
  name: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
  is_starred?: boolean;
  url: string;
}

// API response structure from Claude.ai
interface ProjectApiResponse {
  uuid: string;
  name: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
  is_starred?: boolean;
}

export class ProjectsPage extends BasePage {
  private cachedOrgId: string | null = null;

  constructor(page: Page) {
    super(page);
  }

  // Extract org ID from URL or API calls
  private async getOrgId(): Promise<string | null> {
    if (this.cachedOrgId) {
      return this.cachedOrgId;
    }

    // Try to extract from current URL
    const url = this.url;
    const match = url.match(/organizations\/([^/]+)/);
    if (match) {
      this.cachedOrgId = match[1];
      return this.cachedOrgId;
    }

    return null;
  }

  // Dismiss any open dialog/modal that might be blocking
  private async dismissOpenDialog(): Promise<void> {
    try {
      // Check if a dialog is open by looking for cancel button
      const cancelButton = this.page.locator('button:has-text("Cancel")').first();
      const isVisible = await cancelButton.isVisible({ timeout: 500 }).catch(() => false);

      if (isVisible) {
        log.info('Found open dialog, dismissing it');
        await cancelButton.click();
        await this.page.waitForTimeout(500);
      }
    } catch {
      // No dialog open, continue
    }
  }

  // Navigate to projects page
  async navigate(): Promise<void> {
    // First, dismiss any open dialogs that might be blocking
    await this.dismissOpenDialog();

    // Skip if already on projects page (and no dialog was open)
    if (this.url.includes('/projects')) {
      log.info('Already on projects page, skipping navigation');
      return;
    }

    // Navigate directly to projects URL - use 'commit' which fires earliest
    log.info('Navigating to projects page', { url: CLAUDE_PROJECTS_URL });
    try {
      await this.page.goto(CLAUDE_PROJECTS_URL, {
        waitUntil: 'commit',
        timeout: 15000
      });
    } catch (e) {
      log.warn('Navigation failed, continuing anyway', { error: String(e) });
    }

    // Give the page time to render (Claude SPA doesn't fire load events reliably)
    await this.page.waitForTimeout(2000);

    // Verify we're on the projects page
    const currentUrl = this.page.url();
    log.info('Current URL after navigation', { currentUrl });

    if (!currentUrl.includes('/projects')) {
      log.warn('Not on projects page after first attempt, retrying');
      try {
        await this.page.goto(CLAUDE_PROJECTS_URL, { waitUntil: 'commit', timeout: 10000 });
        await this.page.waitForTimeout(2000);
      } catch {
        log.warn('Retry navigation also failed');
      }
    }

    log.action('navigated to projects');
  }

  // Check if we're on the projects page
  async isOnProjectsPage(): Promise<boolean> {
    return this.url.includes('/project');
  }

  // Get list of all projects - uses DOM scraping for reliability
  async listProjects(): Promise<ProjectInfo[]> {
    return this.withScreenshot('list-projects', async () => {
      // Navigate to projects page
      await this.navigate();

      // Use DOM scraping which is more reliable than API interception
      return this.listProjectsFromDom();
    });
  }

  // Fallback: scrape projects from DOM with scrolling
  private async listProjectsFromDom(): Promise<ProjectInfo[]> {
    const projectsMap = new Map<string, ProjectInfo>(); // Use map to dedupe by ID

    // Wait for the page to be ready
    await this.page.waitForTimeout(1000);

    // Try to find a scrollable container for projects, fallback to main or body
    const scrollContainer = await this.page.evaluate(() => {
      // Try different containers that might hold the projects list
      const main = document.querySelector('main');
      if (main && main.scrollHeight > main.clientHeight) {
        return 'main';
      }
      // Check for any scrollable div that contains project links
      const containers = document.querySelectorAll('div[class*="scroll"], div[style*="overflow"]');
      for (const container of containers) {
        if (container.querySelector('a[href*="/project/"]')) {
          return null; // Use page scroll instead
        }
      }
      return null;
    });

    // Scroll to load lazy content - scroll multiple times to ensure all loaded
    for (let i = 0; i < 5; i++) {
      await this.page.evaluate((selector) => {
        const container = selector ? document.querySelector(selector) : window;
        if (container === window) {
          window.scrollTo(0, document.body.scrollHeight);
        } else if (container instanceof Element) {
          container.scrollTop = container.scrollHeight;
        }
      }, scrollContainer);
      await this.page.waitForTimeout(500);
    }

    // Scroll back to top
    await this.page.evaluate((selector) => {
      const container = selector ? document.querySelector(selector) : window;
      if (container === window) {
        window.scrollTo(0, 0);
      } else if (container instanceof Element) {
        container.scrollTop = 0;
      }
    }, scrollContainer);

    await this.page.waitForTimeout(500);

    // Scrape all project links from the full DOM
    const projectData = await this.page.evaluate(() => {
      const links = document.querySelectorAll('a[href*="/project/"]');
      const results: Array<{ href: string; text: string }> = [];

      links.forEach((link) => {
        const href = link.getAttribute('href');
        if (href && href.includes('/project/')) {
          // Get text content, preferring first line/title
          let text = link.textContent?.trim() || '';
          // Try to get just the title (first meaningful text)
          const firstDiv = link.querySelector('div');
          if (firstDiv) {
            text = firstDiv.textContent?.trim() || text;
          }
          // Clean up text - take first line only
          text = text.split('\n')[0].trim();
          if (text) {
            results.push({ href, text });
          }
        }
      });

      return results;
    });

    log.info(`Scraped ${projectData.length} project links from DOM`);

    // Process scraped data
    for (const { href, text } of projectData) {
      const match = href.match(/\/project\/([^/?]+)/);
      if (match) {
        const id = match[1];
        // Only add if not already seen (deduplication)
        if (!projectsMap.has(id)) {
          projectsMap.set(id, {
            id,
            name: text || `Project ${projectsMap.size + 1}`,
            url: href.startsWith('http') ? href : `${CLAUDE_BASE_URL}${href}`,
          });
        }
      }
    }

    const projects = Array.from(projectsMap.values());
    log.info(`Found ${projects.length} unique projects via DOM`);
    return projects;
  }

  // Fetch projects directly via API (requires intercepting to get org ID first)
  async fetchProjectsViaApi(): Promise<ProjectInfo[]> {
    // Navigate to get org ID if we don't have it
    if (!this.cachedOrgId) {
      await this.navigate();
      // Extract org ID from any API call
      const orgIdMatch = this.url.match(/organizations\/([^/]+)/) ||
        (await this.page.evaluate(() => {
          // Try to find org ID in page scripts or localStorage
          const stored = localStorage.getItem('lastActiveOrg');
          return stored ? [null, stored] : null;
        }));
      if (orgIdMatch) {
        this.cachedOrgId = orgIdMatch[1];
      }
    }

    if (!this.cachedOrgId) {
      log.warn('Could not determine org ID, falling back to DOM');
      return this.listProjectsFromDom();
    }

    // Make direct API call
    const apiUrl = `${CLAUDE_BASE_URL}/api/organizations/${this.cachedOrgId}/projects?include_harmony_projects=true&limit=100`;

    try {
      const response = await this.page.evaluate(async (url) => {
        const resp = await fetch(url, { credentials: 'include' });
        return resp.json();
      }, apiUrl);

      const projects = Array.isArray(response) ? response : (response.projects || response.results || []);
      return projects.map((p: ProjectApiResponse) => ({
        id: p.uuid,
        name: p.name,
        description: p.description,
        created_at: p.created_at,
        updated_at: p.updated_at,
        is_starred: p.is_starred,
        url: getProjectUrl(p.uuid),
      }));
    } catch (e) {
      log.warn('Direct API fetch failed', { error: String(e) });
      return this.listProjectsFromDom();
    }
  }

  // Create a new project
  async createProject(name: string, instructions?: string): Promise<ProjectInfo> {
    return this.withScreenshot('create-project', async () => {
      await this.navigate();

      // Check if create dialog is already open (from a previous failed attempt)
      const dialogAlreadyOpen = await this.exists('projectDetail.nameInput', { timeout: 1000 });

      if (!dialogAlreadyOpen) {
        // Click create button to open dialog
        await this.click('projectList.createProjectButton');
        await this.page.waitForTimeout(500);
      } else {
        log.info('Create dialog already open, skipping button click');
      }

      // Fill in name
      await this.fill('projectDetail.nameInput', name, { clear: true });

      // Fill in description/instructions if provided (this goes in the second field)
      if (instructions) {
        // The second field is for description, not instructions
        const hasDescField = await this.exists('projectDetail.descriptionInput', { timeout: 1000 });
        if (hasDescField) {
          await this.fill('projectDetail.descriptionInput', instructions, { clear: true });
        }
      }

      // Save
      await this.click('projectDetail.saveButton');

      // Wait for URL to change to /project/{uuid} (up to 10 seconds)
      const projectUrlPattern = /\/project\/([0-9a-f-]+)/i;
      let id = '';
      const startTime = Date.now();

      while (Date.now() - startTime < 10000) {
        const currentUrl = this.page.url();
        const match = currentUrl.match(projectUrlPattern);
        if (match) {
          id = match[1];
          break;
        }
        await this.page.waitForTimeout(500);
      }

      log.action('created project', { name, id });

      return {
        id,
        name,
        url: id ? getProjectUrl(id) : this.url,
      };
    });
  }

  // Open a project by ID or name
  async openProject(idOrName: string): Promise<void> {
    return this.withScreenshot('open-project', async () => {
      // If it's a UUID or looks like one, navigate directly
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      if (idOrName.startsWith('http')) {
        await this.goto(idOrName);
        await this.waitForDomStable({ timeout: 5000 });
        return;
      }

      if (uuidPattern.test(idOrName)) {
        // It's a UUID - navigate directly to /project/{uuid}
        await this.goto(getProjectUrl(idOrName));
        await this.waitForDomStable({ timeout: 5000 });
        return;
      }

      // Otherwise, find by name
      const projects = await this.listProjects();
      const project = projects.find(p =>
        p.name.toLowerCase().includes(idOrName.toLowerCase())
      );

      if (!project) {
        throw new Error(`Project not found: ${idOrName}. Available: ${projects.map(p => p.name).join(', ')}`);
      }

      await this.goto(project.url);
      await this.waitForDomStable({ timeout: 5000 });
    });
  }

  // Delete a project
  async deleteProject(idOrName: string): Promise<void> {
    return this.withScreenshot('delete-project', async () => {
      await this.openProject(idOrName);

      // Go to settings
      await this.click('projectDetail.settingsTab');
      await this.page.waitForTimeout(500);

      // Click delete
      await this.click('projectDetail.deleteButton');
      await this.page.waitForTimeout(500);

      // Confirm
      await this.click('modals.confirmButton');
      await this.waitForNavigation();

      log.action('deleted project', { idOrName });
    });
  }

  // Update project instructions
  async updateProjectInstructions(idOrName: string, instructions: string): Promise<void> {
    return this.withScreenshot('update-instructions', async () => {
      await this.openProject(idOrName);

      // Go to settings
      const hasSettingsTab = await this.exists('projectDetail.settingsTab', { timeout: 3000 });
      if (hasSettingsTab) {
        await this.click('projectDetail.settingsTab');
        await this.page.waitForTimeout(500);
      }

      // Update instructions
      await this.fill('projectDetail.instructionsTextarea', instructions, { clear: true });

      // Save
      await this.click('projectDetail.saveButton');
      await this.page.waitForTimeout(1000);

      log.action('updated project instructions', { idOrName });
    });
  }

  // Get current project info from URL
  async getCurrentProjectInfo(): Promise<ProjectInfo | null> {
    const url = this.url;
    // URL format: /project/{uuid}
    const match = url.match(/\/project\/([^/?]+)/);

    if (!match) {
      return null;
    }

    return {
      id: match[1],
      url,
      name: '', // Would need to scrape from page
    };
  }
}
