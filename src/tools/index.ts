import { getPage, navigateToClaude, closeBrowser, getProjectUrl } from '../browser.js';
import { ProjectsPage } from '../pages/projects.js';
import { ChatPage } from '../pages/chat.js';
import { KnowledgePage } from '../pages/knowledge.js';
import { ProjectSettingsPage } from '../pages/project-settings.js';
import {
  validateSelectors,
  formatValidationResults,
  reloadSelectors,
  loadSelectors,
} from '../selectors.js';
import { takeScreenshot, takeFullPageScreenshot } from '../utils/screenshot.js';
import { log } from '../utils/logger.js';

// Tool definitions for MCP
export const tools = [
  // === PROJECT TOOLS ===
  {
    name: 'list_projects',
    description: 'List all Claude.ai projects',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'create_project',
    description: 'Create a new Claude.ai project',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Name for the new project' },
        instructions: { type: 'string', description: 'Custom instructions for the project (optional)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'open_project',
    description: 'Open a project by ID or name and return its current state',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project ID (UUID), name, or URL' },
      },
      required: ['project'],
    },
  },
  {
    name: 'delete_project',
    description: 'Delete a project (use with caution!)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project ID or name to delete' },
        confirm: { type: 'boolean', description: 'Must be true to confirm deletion' },
      },
      required: ['project', 'confirm'],
    },
  },
  {
    name: 'get_project_details',
    description: 'Get full project details including name, description, memory/context, instructions, and file count',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project ID or name' },
      },
      required: ['project'],
    },
  },
  {
    name: 'get_project_memory',
    description: 'Get the project Memory/Context content (Purpose & context, Current state, Key learnings, etc.)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project ID or name' },
      },
      required: ['project'],
    },
  },
  {
    name: 'get_project_instructions',
    description: 'Get the project custom instructions',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project ID or name' },
      },
      required: ['project'],
    },
  },
  {
    name: 'set_project_instructions',
    description: 'Set/update the project custom instructions',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project ID or name' },
        instructions: { type: 'string', description: 'New instructions content' },
      },
      required: ['project', 'instructions'],
    },
  },

  // === CHAT TOOLS ===
  {
    name: 'send_message',
    description: 'Send a message in a project chat and get Claude\'s response. Must open_project first or specify project.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project ID or name (optional if already in a project)' },
        message: { type: 'string', description: 'Message to send to Claude' },
        wait_for_response: { type: 'boolean', description: 'Wait for Claude to respond (default: true)' },
      },
      required: ['message'],
    },
  },
  {
    name: 'get_response',
    description: 'Get the last response from Claude in the current chat',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'list_conversations',
    description: 'List conversations within the current project',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project ID or name' },
      },
      required: ['project'],
    },
  },
  {
    name: 'open_conversation',
    description: 'Open a specific conversation within a project',
    inputSchema: {
      type: 'object' as const,
      properties: {
        conversation_id: { type: 'string', description: 'Conversation ID or URL' },
      },
      required: ['conversation_id'],
    },
  },

  // === FILE/KNOWLEDGE TOOLS ===
  {
    name: 'list_project_files',
    description: 'List all files in a project\'s knowledge base',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project ID or name' },
      },
      required: ['project'],
    },
  },
  {
    name: 'upload_file',
    description: 'Upload a file to project knowledge base',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project ID or name' },
        file_path: { type: 'string', description: 'Local path to the file to upload' },
      },
      required: ['project', 'file_path'],
    },
  },
  {
    name: 'delete_file',
    description: 'Delete a file from project knowledge base',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project ID or name' },
        file_name: { type: 'string', description: 'Name of the file to delete' },
      },
      required: ['project', 'file_name'],
    },
  },
  {
    name: 'read_file',
    description: 'Read the contents of a file in project knowledge base',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project ID or name' },
        file_name: { type: 'string', description: 'Name of the file to read' },
      },
      required: ['project', 'file_name'],
    },
  },
  {
    name: 'create_file',
    description: 'Create a new text file in project knowledge base',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project ID or name' },
        file_name: { type: 'string', description: 'Name for the new file (e.g., "notes.md")' },
        content: { type: 'string', description: 'Text content for the file' },
      },
      required: ['project', 'file_name', 'content'],
    },
  },

  // === DEBUG TOOLS ===
  {
    name: 'take_screenshot',
    description: 'Take a screenshot of the current browser state for debugging',
    inputSchema: {
      type: 'object' as const,
      properties: {
        label: { type: 'string', description: 'Label for the screenshot file' },
        full_page: { type: 'boolean', description: 'Capture full page (default: false)' },
      },
      required: [],
    },
  },
  {
    name: 'validate_selectors',
    description: 'Validate that selectors still work on the current page. Use to diagnose UI issues.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        category: { type: 'string', description: 'Selector category to validate (e.g., "chat", "projectFiles")' },
      },
      required: [],
    },
  },
  {
    name: 'reload_selectors',
    description: 'Reload selectors from selectors.json file after manual edits',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_selectors',
    description: 'Get the current selectors configuration',
    inputSchema: {
      type: 'object' as const,
      properties: {
        category: { type: 'string', description: 'Specific category to get (optional)' },
      },
      required: [],
    },
  },
  {
    name: 'get_page_info',
    description: 'Get information about the current page state',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'close_browser',
    description: 'Close the browser instance',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
];

// Tool handlers
export async function handleTool(name: string, args: Record<string, unknown>): Promise<string> {
  try {
    switch (name) {
      // === PROJECT TOOLS ===
      case 'list_projects': {
        const page = await getPage();
        const projectsPage = new ProjectsPage(page);
        const projects = await projectsPage.listProjects();
        return JSON.stringify(projects, null, 2);
      }

      case 'create_project': {
        const { name: projectName, instructions } = args as { name: string; instructions?: string };
        const page = await getPage();
        const projectsPage = new ProjectsPage(page);
        const project = await projectsPage.createProject(projectName, instructions);
        return JSON.stringify(project, null, 2);
      }

      case 'open_project': {
        const { project } = args as { project: string };
        const page = await getPage();
        const projectsPage = new ProjectsPage(page);
        await projectsPage.openProject(project);

        // Get project info after opening
        const chatPage = new ChatPage(page);
        const knowledgePage = new KnowledgePage(page);

        const conversations = await chatPage.getProjectConversations();
        const files = await knowledgePage.listFiles();

        return JSON.stringify({
          status: 'opened',
          project,
          url: page.url(),
          conversations: conversations.length,
          files: files.length,
          conversationList: conversations,
          fileList: files,
        }, null, 2);
      }

      // ============================================================
      // DELETE_PROJECT IS DISABLED FOR SAFETY
      // ============================================================
      // This functionality is temporarily disabled because:
      // 1. Delete is a DANGEROUS operation that cannot be undone
      // 2. The UI selectors need to be updated (no Settings tab in current UI)
      // 3. Need to implement proper safeguards before re-enabling
      //
      // To re-enable: uncomment the original code below and update
      // the deleteProject() method in projects.ts with correct selectors
      // ============================================================
      //
      // ORIGINAL CODE (DO NOT DELETE):
      // case 'delete_project': {
      //   const { project, confirm } = args as { project: string; confirm: boolean };
      //   if (!confirm) {
      //     return 'Error: Must set confirm=true to delete a project';
      //   }
      //   const page = await getPage();
      //   const projectsPage = new ProjectsPage(page);
      //   await projectsPage.deleteProject(project);
      //   return `Deleted project: ${project}`;
      // }
      //
      // ============================================================
      case 'delete_project': {
        // Return a clear error message explaining why this is disabled
        return 'Error: delete_project is DISABLED for safety. ' +
          'The delete functionality requires UI selector updates. ' +
          'Please delete projects manually via the Claude.ai web interface.';
      }

      case 'get_project_details': {
        const { project } = args as { project: string };
        const page = await getPage();
        const projectsPage = new ProjectsPage(page);
        await projectsPage.openProject(project);

        const settingsPage = new ProjectSettingsPage(page);
        const details = await settingsPage.getProjectDetails();
        return JSON.stringify(details, null, 2);
      }

      case 'get_project_memory': {
        const { project } = args as { project: string };
        const page = await getPage();
        const projectsPage = new ProjectsPage(page);
        await projectsPage.openProject(project);

        const settingsPage = new ProjectSettingsPage(page);
        const memory = await settingsPage.getMemory();
        return JSON.stringify(memory, null, 2);
      }

      case 'get_project_instructions': {
        const { project } = args as { project: string };
        const page = await getPage();
        const projectsPage = new ProjectsPage(page);
        await projectsPage.openProject(project);

        const settingsPage = new ProjectSettingsPage(page);
        const instructions = await settingsPage.getInstructions();
        return instructions || '(No instructions set)';
      }

      case 'set_project_instructions': {
        const { project, instructions } = args as { project: string; instructions: string };
        const page = await getPage();
        const projectsPage = new ProjectsPage(page);
        await projectsPage.openProject(project);

        const settingsPage = new ProjectSettingsPage(page);
        await settingsPage.setInstructions(instructions);
        return 'Instructions updated';
      }

      // === CHAT TOOLS ===
      case 'send_message': {
        const { project, message, wait_for_response = true } = args as {
          project?: string;
          message: string;
          wait_for_response?: boolean;
        };

        const page = await getPage();

        if (project) {
          const projectsPage = new ProjectsPage(page);
          await projectsPage.openProject(project);
        }

        const chatPage = new ChatPage(page);
        const response = await chatPage.sendMessage(message, wait_for_response);

        if (wait_for_response && response) {
          return response;
        }
        return 'Message sent (not waiting for response)';
      }

      case 'get_response': {
        const page = await getPage();
        const chatPage = new ChatPage(page);
        const response = await chatPage.getLastAssistantMessage();
        return response || 'No response found';
      }

      case 'list_conversations': {
        const { project } = args as { project: string };
        const page = await getPage();
        const projectsPage = new ProjectsPage(page);
        await projectsPage.openProject(project);

        const chatPage = new ChatPage(page);
        const conversations = await chatPage.getProjectConversations();
        return JSON.stringify(conversations, null, 2);
      }

      case 'open_conversation': {
        const { conversation_id } = args as { conversation_id: string };
        const page = await getPage();
        const chatPage = new ChatPage(page);
        await chatPage.openConversation(conversation_id);
        return `Opened conversation: ${conversation_id}`;
      }

      // === FILE/KNOWLEDGE TOOLS ===
      case 'list_project_files': {
        const { project } = args as { project: string };
        const page = await getPage();
        const projectsPage = new ProjectsPage(page);
        await projectsPage.openProject(project);

        const knowledgePage = new KnowledgePage(page);
        const files = await knowledgePage.listFiles();
        return JSON.stringify(files, null, 2);
      }

      case 'upload_file': {
        const { project, file_path } = args as { project: string; file_path: string };
        const page = await getPage();
        const projectsPage = new ProjectsPage(page);
        await projectsPage.openProject(project);

        const knowledgePage = new KnowledgePage(page);
        await knowledgePage.uploadFile(file_path);
        return `Uploaded file: ${file_path}`;
      }

      case 'delete_file': {
        const { project, file_name } = args as { project: string; file_name: string };
        const page = await getPage();
        const projectsPage = new ProjectsPage(page);
        await projectsPage.openProject(project);

        const knowledgePage = new KnowledgePage(page);
        await knowledgePage.deleteFile(file_name);
        return `Deleted file: ${file_name}`;
      }

      case 'read_file': {
        const { project, file_name } = args as { project: string; file_name: string };
        const page = await getPage();
        const projectsPage = new ProjectsPage(page);
        await projectsPage.openProject(project);

        const knowledgePage = new KnowledgePage(page);
        const content = await knowledgePage.readFileContent(file_name);
        return content;
      }

      case 'create_file': {
        const { project, file_name, content } = args as { project: string; file_name: string; content: string };
        const page = await getPage();
        const projectsPage = new ProjectsPage(page);
        await projectsPage.openProject(project);

        const knowledgePage = new KnowledgePage(page);
        await knowledgePage.createTextFile(file_name, content);
        return `Created file: ${file_name} (${content.length} characters)`;
      }

      // === DEBUG TOOLS ===
      case 'take_screenshot': {
        const { label = 'manual', full_page = false } = args as { label?: string; full_page?: boolean };
        const page = await getPage();

        const result = full_page
          ? await takeFullPageScreenshot(page, label)
          : await takeScreenshot(page, label);

        return `Screenshot saved: ${result.path}`;
      }

      case 'validate_selectors': {
        const { category } = args as { category?: string };
        const page = await getPage();

        // Make sure we're on Claude.ai
        if (!page.url().includes('claude.ai')) {
          await navigateToClaude();
        }

        const results = await validateSelectors(page, category);
        return formatValidationResults(results);
      }

      case 'reload_selectors': {
        reloadSelectors();
        return 'Selectors reloaded from file';
      }

      case 'get_selectors': {
        const { category } = args as { category?: string };
        const selectors = loadSelectors();

        if (category) {
          return JSON.stringify(selectors[category] || {}, null, 2);
        }
        return JSON.stringify(selectors, null, 2);
      }

      case 'get_page_info': {
        const page = await getPage();

        // Get current URL and basic state
        const url = page.url();
        const title = await page.title();

        // Determine context
        let context = 'unknown';
        if (url.includes('/project/')) {
          context = 'project';
        } else if (url.includes('/projects')) {
          context = 'projects_list';
        } else if (url.includes('/chat/')) {
          context = 'conversation';
        } else if (url.includes('/new')) {
          context = 'new_chat';
        }

        // Extract project/chat ID if applicable
        const projectMatch = url.match(/\/project\/([^/?]+)/);
        const chatMatch = url.match(/\/chat\/([^/?]+)/);

        return JSON.stringify({
          url,
          title,
          context,
          projectId: projectMatch ? projectMatch[1] : null,
          chatId: chatMatch ? chatMatch[1] : null,
        }, null, 2);
      }

      case 'close_browser': {
        await closeBrowser();
        return 'Browser closed';
      }

      default:
        return `Unknown tool: ${name}`;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Tool ${name} failed`, { error: errorMessage });

    // Try to take a screenshot on error
    try {
      const page = await getPage();
      const screenshot = await takeScreenshot(page, `error_${name}`);
      return `Error: ${errorMessage}\n\nScreenshot saved: ${screenshot.path}`;
    } catch {
      return `Error: ${errorMessage}`;
    }
  }
}
