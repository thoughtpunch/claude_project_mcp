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
    name: 'send_message_with_file',
    description: 'Send a message with an attached file in a project chat',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project ID or name (optional if already in a project)' },
        message: { type: 'string', description: 'Message to send to Claude' },
        file_path: { type: 'string', description: 'Local path to the file to attach' },
        wait_for_response: { type: 'boolean', description: 'Wait for Claude to respond (default: true)' },
      },
      required: ['message', 'file_path'],
    },
  },
  {
    name: 'attach_file_to_chat',
    description: 'Attach a file to the chat input (without sending). Use send_message after to send.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        file_path: { type: 'string', description: 'Local path to the file to attach' },
      },
      required: ['file_path'],
    },
  },
  {
    name: 'add_artifact_to_project',
    description: 'Add the most recent artifact (document/code created by Claude) to project knowledge',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'list_artifacts',
    description: 'List artifacts (documents/code) created by Claude in the current conversation',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
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
    name: 'dismiss_notifications',
    description: 'Dismiss notification banners that may be blocking content',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_full_response',
    description: 'Get the full last response from Claude, scrolling to capture all content',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_full_conversation',
    description: 'Get the entire conversation with all messages from both human and assistant',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'analyze_page',
    description: 'Analyze the current page state - useful for understanding context and debugging',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'sync_context',
    description: 'Sync Claude Code working context to project knowledge. Creates/updates a context file with current state, decisions, and learnings. Use this to persist important context across sessions.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project ID or name' },
        context: { type: 'string', description: 'Current working context to store (files being worked on, decisions made, blockers, etc.)' },
        append: { type: 'boolean', description: 'Append to existing context file instead of replacing (default: false)' },
      },
      required: ['project', 'context'],
    },
  },
  {
    name: 'ask_project',
    description: 'Ask the project Claude a question and get guidance based on project knowledge, memory, and accumulated context. Use this when you need context-aware advice.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project ID or name' },
        question: { type: 'string', description: 'Question to ask the project Claude' },
        include_context: { type: 'boolean', description: 'Include recent conversation context in the question (default: true)' },
      },
      required: ['project', 'question'],
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
  {
    name: 'connect_github',
    description: 'Open the GitHub connection dialog to link a repository to project knowledge base. Note: May require OAuth authentication.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project ID or name' },
      },
      required: ['project'],
    },
  },
  {
    name: 'connect_google_drive',
    description: 'Open the Google Drive connection dialog to link files to project knowledge base. Note: May require OAuth authentication.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project ID or name' },
      },
      required: ['project'],
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
  {
    name: 'click_element',
    description: 'Click an element by selector path (e.g., "projectFiles.addFilesButton") or CSS selector',
    inputSchema: {
      type: 'object' as const,
      properties: {
        selector: { type: 'string', description: 'Selector path (e.g., "chat.sendButton") or CSS selector' },
        is_css: { type: 'boolean', description: 'If true, treat selector as raw CSS instead of selector path' },
      },
      required: ['selector'],
    },
  },
  {
    name: 'get_element_html',
    description: 'Get the HTML content of elements matching a CSS selector (for debugging UI)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        selector: { type: 'string', description: 'CSS selector to find elements' },
        limit: { type: 'number', description: 'Max number of elements to return (default: 3)' },
      },
      required: ['selector'],
    },
  },
  {
    name: 'scroll',
    description: 'Scroll the page or a specific element',
    inputSchema: {
      type: 'object' as const,
      properties: {
        direction: { type: 'string', description: 'Direction: "up", "down", "top", "bottom"' },
        amount: { type: 'number', description: 'Pixels to scroll (default: 500, ignored for top/bottom)' },
        selector: { type: 'string', description: 'CSS selector of element to scroll (optional, scrolls page if not provided)' },
      },
      required: ['direction'],
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

      case 'send_message_with_file': {
        const { project, message, file_path, wait_for_response = true } = args as {
          project?: string;
          message: string;
          file_path: string;
          wait_for_response?: boolean;
        };

        const page = await getPage();

        if (project) {
          const projectsPage = new ProjectsPage(page);
          await projectsPage.openProject(project);
        }

        const chatPage = new ChatPage(page);
        const response = await chatPage.sendMessageWithFile(message, file_path, wait_for_response);

        if (wait_for_response && response) {
          return response;
        }
        return 'Message with file sent (not waiting for response)';
      }

      case 'attach_file_to_chat': {
        const { file_path } = args as { file_path: string };
        const page = await getPage();
        const chatPage = new ChatPage(page);
        await chatPage.attachFile(file_path);
        return `File attached: ${file_path}`;
      }

      case 'add_artifact_to_project': {
        const page = await getPage();
        const chatPage = new ChatPage(page);
        await chatPage.addArtifactToProject();
        return 'Artifact added to project knowledge';
      }

      case 'list_artifacts': {
        const page = await getPage();
        const chatPage = new ChatPage(page);
        const artifacts = await chatPage.getArtifacts();
        return JSON.stringify(artifacts, null, 2);
      }

      case 'get_response': {
        const page = await getPage();
        const chatPage = new ChatPage(page);
        const response = await chatPage.getLastAssistantMessage();
        return response || 'No response found';
      }

      case 'dismiss_notifications': {
        const page = await getPage();
        const chatPage = new ChatPage(page);
        await chatPage.dismissNotifications();
        return 'Notifications dismissed';
      }

      case 'get_full_response': {
        const page = await getPage();
        const chatPage = new ChatPage(page);
        const response = await chatPage.getFullResponse();
        return response || 'No response found';
      }

      case 'get_full_conversation': {
        const page = await getPage();
        const chatPage = new ChatPage(page);
        const messages = await chatPage.getFullConversation();
        return JSON.stringify(messages, null, 2);
      }

      case 'analyze_page': {
        const page = await getPage();
        const chatPage = new ChatPage(page);
        const state = await chatPage.analyzePageState();
        return JSON.stringify(state, null, 2);
      }

      case 'sync_context': {
        const { project, context, append = false } = args as {
          project: string;
          context: string;
          append?: boolean;
        };
        const page = await getPage();
        const projectsPage = new ProjectsPage(page);
        const knowledgePage = new KnowledgePage(page);

        await projectsPage.openProject(project);
        await page.waitForTimeout(1000);

        const fileName = 'CLAUDE_CODE_CONTEXT.md';
        const timestamp = new Date().toISOString();
        let content: string;

        if (append) {
          // Try to read existing content
          const existing = await knowledgePage.readFileContent(fileName).catch(() => '');
          content = existing
            ? `${existing}\n\n---\n\n## Update: ${timestamp}\n\n${context}`
            : `# Claude Code Context\n\n## Created: ${timestamp}\n\n${context}`;
        } else {
          content = `# Claude Code Context\n\nLast synced: ${timestamp}\n\n${context}`;
        }

        // Check if file exists and update/create accordingly
        const files = await knowledgePage.listFiles();
        const fileExists = files.some(f => f.name === fileName);

        if (fileExists) {
          // Delete and recreate (simpler than editing)
          await knowledgePage.deleteFile(fileName).catch(() => {});
          await page.waitForTimeout(500);
        }

        await knowledgePage.createTextFile(fileName, content);
        return `Context synced to ${fileName} in project "${project}"`;
      }

      case 'ask_project': {
        const { project, question, include_context = true } = args as {
          project: string;
          question: string;
          include_context?: boolean;
        };
        const page = await getPage();
        const projectsPage = new ProjectsPage(page);
        const chatPage = new ChatPage(page);

        await projectsPage.openProject(project);
        await page.waitForTimeout(1000);

        // Build the question with context if requested
        let fullQuestion = question;
        if (include_context) {
          fullQuestion = `[Question from Claude Code seeking guidance based on project knowledge]\n\n${question}\n\nPlease provide advice based on the project's accumulated knowledge, memory, and context files.`;
        }

        // Send the question and wait for response
        const response = await chatPage.sendMessage(fullQuestion, true);
        return response || 'No response received';
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

      case 'connect_github': {
        const { project } = args as { project: string };
        const page = await getPage();
        const projectsPage = new ProjectsPage(page);
        await projectsPage.openProject(project);

        const knowledgePage = new KnowledgePage(page);
        await knowledgePage.connectGitHub();
        return 'GitHub connection dialog opened. You may need to complete OAuth authentication in the browser.';
      }

      case 'connect_google_drive': {
        const { project } = args as { project: string };
        const page = await getPage();
        const projectsPage = new ProjectsPage(page);
        await projectsPage.openProject(project);

        const knowledgePage = new KnowledgePage(page);
        await knowledgePage.connectGoogleDrive();
        return 'Google Drive connection dialog opened. You may need to complete OAuth authentication in the browser.';
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

      case 'click_element': {
        const { selector, is_css = false } = args as { selector: string; is_css?: boolean };
        const page = await getPage();

        if (is_css) {
          await page.locator(selector).first().click();
        } else {
          // Try to use selector path from selectors.json
          const { clickElement } = await import('../selectors.js');
          await clickElement(page, selector);
        }
        return `Clicked: ${selector}`;
      }

      case 'get_element_html': {
        const { selector, limit = 3 } = args as { selector: string; limit?: number };
        const page = await getPage();

        const elements = page.locator(selector);
        const count = await elements.count();
        const results: string[] = [];

        for (let i = 0; i < Math.min(count, limit); i++) {
          const html = await elements.nth(i).innerHTML().catch(() => '(error getting innerHTML)');
          results.push(`[${i}] ${html.substring(0, 1000)}`);
        }

        return `Found ${count} elements matching "${selector}":\n\n${results.join('\n\n')}`;
      }

      case 'scroll': {
        const { direction, amount = 500, selector } = args as {
          direction: string;
          amount?: number;
          selector?: string;
        };
        const page = await getPage();

        // Helper function to find scrollable chat container
        const findScrollableContainer = async (): Promise<string | null> => {
          return page.evaluate(() => {
            // Find elements that are actually scrollable (scrollHeight > clientHeight and has overflow)
            const candidates = document.querySelectorAll('*');
            for (const el of candidates) {
              const style = window.getComputedStyle(el);
              const overflowY = style.overflowY;
              const scrollHeight = el.scrollHeight;
              const clientHeight = el.clientHeight;

              // Check if it's a scrollable container with chat messages
              if ((overflowY === 'auto' || overflowY === 'scroll') &&
                  scrollHeight > clientHeight + 100 &&
                  (el.querySelector('.font-claude-response') || el.querySelector('[data-testid="user-message"]'))) {
                // Return a unique selector for this element
                if (el.id) return `#${el.id}`;
                if (el.className) {
                  const classes = el.className.split(' ').filter((c: string) => c && !c.includes('[')).slice(0, 3).join('.');
                  if (classes) return `.${classes}`;
                }
              }
            }
            return null;
          });
        };

        let targetSelector = selector;

        // If no selector provided and we're on a chat page, try to find the scrollable container
        if (!targetSelector) {
          const url = page.url();
          if (url.includes('/chat/') || url.includes('/project/')) {
            const foundSelector = await findScrollableContainer();
            if (foundSelector) {
              targetSelector = foundSelector;
              log.debug(`Auto-detected scrollable container: ${foundSelector}`);
            }
          }
        }

        if (targetSelector) {
          // Scroll within a specific element
          const element = page.locator(targetSelector).first();
          if (await element.count() === 0) {
            return `Element not found: ${targetSelector}`;
          }

          switch (direction) {
            case 'down':
              await element.evaluate((el, amt) => el.scrollBy(0, amt), amount);
              break;
            case 'up':
              await element.evaluate((el, amt) => el.scrollBy(0, -amt), amount);
              break;
            case 'top':
              await element.evaluate(el => el.scrollTo(0, 0));
              break;
            case 'bottom':
              await element.evaluate(el => el.scrollTo(0, el.scrollHeight));
              break;
            default:
              return `Invalid direction: ${direction}. Use: up, down, top, bottom`;
          }
        } else {
          // Scroll using keyboard (works reliably in chat pages)
          // Calculate number of key presses based on amount (roughly 40px per arrow press)
          const presses = Math.max(1, Math.ceil(amount / 100));

          switch (direction) {
            case 'down':
              for (let i = 0; i < presses; i++) {
                await page.keyboard.press('ArrowDown');
                await page.waitForTimeout(50);
              }
              break;
            case 'up':
              for (let i = 0; i < presses; i++) {
                await page.keyboard.press('ArrowUp');
                await page.waitForTimeout(50);
              }
              break;
            case 'top':
              await page.keyboard.press('Home');
              break;
            case 'bottom':
              await page.keyboard.press('End');
              break;
            default:
              return `Invalid direction: ${direction}. Use: up, down, top, bottom`;
          }
        }

        await page.waitForTimeout(300);
        return `Scrolled ${direction}${targetSelector ? ` in ${targetSelector}` : ''}`;
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
