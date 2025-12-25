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

  // Navigate to projects page
  async navigate(): Promise<void> {
    await this.withScreenshot('navigate-to-projects', async () => {
      // If not on claude.ai, go there first
      if (!this.url.includes('claude.ai')) {
        await this.goto(CLAUDE_BASE_URL);
        await this.waitForNetworkIdle({ timeout: 10000 });
      }

      // Navigate directly to projects URL
      await this.goto(CLAUDE_PROJECTS_URL);
      await this.waitForNetworkIdle({ timeout: 10000 });

      log.action('navigated to projects');
    });
  }

  // Check if we're on the projects page
  async isOnProjectsPage(): Promise<boolean> {
    return this.url.includes('/project');
  }

  // Get list of all projects using API interception
  async listProjects(): Promise<ProjectInfo[]> {
    return this.withScreenshot('list-projects', async () => {
      // Set up API interception
      let apiResponse: ProjectApiResponse[] | null = null;

      const responsePromise = this.page.waitForResponse(
        (response: Response) => PROJECTS_API_PATTERN.test(response.url()) && response.status() === 200,
        { timeout: 15000 }
      ).catch(() => null);

      // Navigate to projects to trigger API call
      await this.navigate();

      // Try to get API response
      const response = await responsePromise;
      if (response) {
        try {
          const data = await response.json();
          // API returns array directly or wrapped in a property
          apiResponse = Array.isArray(data) ? data : (data.projects || data.results || []);
          log.info(`Got ${apiResponse?.length || 0} projects from API`);
        } catch (e) {
          log.warn('Failed to parse API response', { error: String(e) });
        }
      }

      // If we got API data, use it
      if (apiResponse && apiResponse.length > 0) {
        return apiResponse.map((p: ProjectApiResponse) => ({
          id: p.uuid,
          name: p.name,
          description: p.description,
          created_at: p.created_at,
          updated_at: p.updated_at,
          is_starred: p.is_starred,
          url: getProjectUrl(p.uuid),
        }));
      }

      // Fallback to DOM scraping
      log.info('Falling back to DOM scraping for project list');
      return this.listProjectsFromDom();
    });
  }

  // Fallback: scrape projects from DOM
  private async listProjectsFromDom(): Promise<ProjectInfo[]> {
    const projects: ProjectInfo[] = [];

    // Wait for project list to load
    const hasProjects = await this.exists('projectList.container', { timeout: 5000 });
    if (!hasProjects) {
      // Try to find any project links
      const projectLinks = this.page.locator('a[href*="/project/"]');
      const count = await projectLinks.count();

      for (let i = 0; i < count; i++) {
        const link = projectLinks.nth(i);
        const href = await link.getAttribute('href');
        const text = await link.innerText().catch(() => '');

        if (href) {
          const match = href.match(/\/project\/([^/?]+)/);
          if (match) {
            projects.push({
              id: match[1],
              name: text.split('\n')[0].trim() || `Project ${i + 1}`,
              url: href.startsWith('http') ? href : `${CLAUDE_BASE_URL}${href}`,
            });
          }
        }
      }
    } else {
      // Use configured selectors
      const projectItems = await this.findAll('projectList.projectItem');
      const count = await projectItems.count();

      for (let i = 0; i < count; i++) {
        const item = projectItems.nth(i);
        let name = '';
        try {
          name = await item.innerText();
          name = name.split('\n')[0].trim();
        } catch {
          name = `Project ${i + 1}`;
        }

        let url: string | undefined;
        let id: string | undefined;
        try {
          const href = await item.locator('a').first().getAttribute('href');
          if (href) {
            url = href.startsWith('http') ? href : `${CLAUDE_BASE_URL}${href}`;
            const match = href.match(/\/project\/([^/?]+)/);
            if (match) {
              id = match[1];
            }
          }
        } catch {}

        if (id) {
          projects.push({ id, name, url: url || getProjectUrl(id) });
        }
      }
    }

    log.info(`Found ${projects.length} projects via DOM`);
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

      // Click create button
      await this.click('projectList.createProjectButton');
      await this.page.waitForTimeout(500);

      // Fill in name
      await this.fill('projectDetail.nameInput', name, { clear: true });

      // Fill in instructions if provided
      if (instructions) {
        await this.fill('projectDetail.instructionsTextarea', instructions, { clear: true });
      }

      // Save
      await this.click('projectDetail.saveButton');
      await this.waitForNavigation();

      log.action('created project', { name });

      // Get the new project's ID from URL (format: /project/{uuid})
      const url = this.url;
      const match = url.match(/\/project\/([^/?]+)/);
      const id = match ? match[1] : '';

      return {
        id,
        name,
        url: id ? getProjectUrl(id) : url,
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
        await this.waitForNetworkIdle({ timeout: 10000 });
        return;
      }

      if (uuidPattern.test(idOrName)) {
        // It's a UUID - navigate directly to /project/{uuid}
        await this.goto(getProjectUrl(idOrName));
        await this.waitForNetworkIdle({ timeout: 10000 });
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
      await this.waitForNetworkIdle({ timeout: 10000 });
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
