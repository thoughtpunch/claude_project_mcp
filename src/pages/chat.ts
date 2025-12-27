import { Page } from 'playwright';
import { BasePage } from './base.js';
import { log } from '../utils/logger.js';

export interface ChatMessage {
  role: 'human' | 'assistant';
  content: string;
}

export interface ConversationInfo {
  id: string;
  title: string;
  lastMessage?: string;
  url: string;
}

export class ChatPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  // Check if we're in a chat context (project or regular)
  async isInChat(): Promise<boolean> {
    return this.exists('chat.chatInputContainer', { timeout: 3000 });
  }

  // Send a message and optionally wait for response
  async sendMessage(message: string, waitForResponse: boolean = true): Promise<string | null> {
    return this.withScreenshot('send-message', async () => {
      log.action('sending message', { length: message.length });

      // Claude.ai uses TipTap/ProseMirror editor - need to handle carefully
      // First, try to find the ProseMirror editor
      const hasProseMirror = await this.exists('chat.messageInput', { timeout: 3000 });

      if (hasProseMirror) {
        // Click to focus the editor
        await this.click('chat.messageInput');
        await this.page.waitForTimeout(200);

        // Clear any existing content
        await this.page.keyboard.press('Meta+A'); // Select all on Mac
        await this.page.keyboard.press('Backspace');
        await this.page.waitForTimeout(100);

        // Type the message character by character for ProseMirror
        // Using page.keyboard.type() works better than fill() for contenteditable
        await this.page.keyboard.type(message, { delay: 5 });
      } else {
        // Fallback to SSR textarea
        const textarea = await this.find('chat.messageInputSsr', { timeout: 3000 });
        await textarea.fill(message);
      }

      // Small delay to ensure input is registered
      await this.page.waitForTimeout(300);

      // Click send button
      await this.click('chat.sendButton');

      if (!waitForResponse) {
        return null;
      }

      // Wait for response to complete
      const response = await this.waitForResponse();
      return response;
    });
  }

  // Wait for Claude to finish responding
  async waitForResponse(timeout: number = 120000): Promise<string> {
    log.action('waiting for response');

    const startTime = Date.now();

    // Wait for response to start - check for stop button OR thinking indicator
    try {
      const responseStarted = await Promise.race([
        this.exists('chat.responseInProgress', { timeout: 10000 }).then(() => 'stop_button'),
        this.exists('chat.thinkingIndicator', { timeout: 10000 }).then(() => 'thinking'),
      ]).catch(() => null);

      if (responseStarted) {
        log.debug(`Response started (detected: ${responseStarted})`);
      }
    } catch {
      // Response might have already completed quickly or not started
      log.debug('No response indicator found - response may have completed quickly');
    }

    // Wait for response to complete
    // Check for: stop button gone, send button visible, or error
    while (Date.now() - startTime < timeout) {
      // Check for error state first - look for visible alert banners only
      const errorAlert = this.page.locator('[role="alert"]:visible, [data-testid="error-message"]:visible');
      const errorCount = await errorAlert.count().catch(() => 0);
      if (errorCount > 0) {
        const errorText = await errorAlert.first().innerText().catch(() => '');
        // Only treat as error if there's actual error text
        if (errorText && (errorText.toLowerCase().includes('error') || errorText.toLowerCase().includes('limit'))) {
          log.warn('Error detected in chat response', { errorText });
          throw new Error(`Chat error: ${errorText}`);
        }
      }

      // Check if still streaming
      const isStreaming = await this.exists('chat.responseInProgress', { timeout: 500 });
      const isThinking = await this.exists('chat.thinkingIndicator', { timeout: 500 });

      if (!isStreaming && !isThinking) {
        // Double-check by looking for send button (response complete indicator)
        const isComplete = await this.exists('chat.responseComplete', { timeout: 1000 });
        if (isComplete) {
          log.debug('Response complete (send button visible)');
          await this.page.waitForTimeout(500); // Wait for final render
          break;
        }
      }

      await this.page.waitForTimeout(500);
    }

    // Get the response
    const response = await this.getLastAssistantMessage();
    log.action('received response', { length: response.length });
    return response;
  }

  // Get the last assistant message
  async getLastAssistantMessage(): Promise<string> {
    try {
      // Try multiple selectors for Claude's response content
      const selectors = [
        '.font-claude-response .standard-markdown',  // Main response content
        'messages.assistantMessageContent',          // From selectors.json
        '.font-claude-response-body',                // Response body paragraphs
      ];

      for (const selector of selectors) {
        const isPath = selector.includes('.');
        const locator = isPath && !selector.startsWith('.')
          ? await this.findAll(selector).catch(() => null)
          : this.page.locator(selector);

        if (!locator) continue;

        const count = await locator.count();
        if (count > 0) {
          // Get the last response (most recent)
          const lastMessage = locator.nth(count - 1);
          const text = await lastMessage.innerText();
          if (text && text.trim().length > 0) {
            log.debug(`Found response using selector: ${selector}`);
            return text.trim();
          }
        }
      }

      // Fallback: try to find any response-like content
      const proseContent = this.page.locator('.standard-markdown').last();
      if (await proseContent.count() > 0) {
        return await proseContent.innerText();
      }

      log.warn('Could not find assistant messages');
      return '';
    } catch (error) {
      log.warn('Error getting last assistant message', { error: String(error) });
      return '';
    }
  }

  // Dismiss notification banners that may block content
  async dismissNotifications(): Promise<void> {
    try {
      // Look for common notification dismiss patterns
      const dismissSelectors = [
        'button:has-text("×")',
        '[aria-label="Close"]',
        '[aria-label="Dismiss"]',
        'button:near(:text("Notify")):has-text("×")',
      ];

      for (const selector of dismissSelectors) {
        const btn = this.page.locator(selector).first();
        if (await btn.count() > 0 && await btn.isVisible()) {
          await btn.click({ timeout: 2000 }).catch(() => {});
          await this.page.waitForTimeout(200);
        }
      }
    } catch {
      // Ignore errors - notifications may not be present
    }
  }

  // Scroll to bottom of chat using keyboard
  async scrollToBottom(): Promise<void> {
    await this.page.keyboard.press('End');
    await this.page.waitForTimeout(300);
  }

  // Scroll to top of chat using keyboard
  async scrollToTop(): Promise<void> {
    await this.page.keyboard.press('Home');
    await this.page.waitForTimeout(300);
  }

  // Get full response by scrolling through entire content
  async getFullResponse(): Promise<string> {
    try {
      // First scroll to bottom to ensure we're at the latest response
      await this.scrollToBottom();
      await this.dismissNotifications();

      // Get all response content
      const responseElements = this.page.locator('.font-claude-response .standard-markdown');
      const count = await responseElements.count();

      if (count === 0) {
        return '';
      }

      // Get the last response (most recent)
      const allTexts: string[] = [];
      for (let i = 0; i < count; i++) {
        const text = await responseElements.nth(i).innerText().catch(() => '');
        if (text.trim()) {
          allTexts.push(text.trim());
        }
      }

      // Return the last non-empty response
      return allTexts[allTexts.length - 1] || '';
    } catch (error) {
      log.warn('Error getting full response', { error: String(error) });
      return '';
    }
  }

  // Get entire conversation with all messages
  async getFullConversation(): Promise<{ role: string; content: string }[]> {
    const messages: { role: string; content: string }[] = [];

    try {
      // Scroll to top first
      await this.scrollToTop();
      await this.page.waitForTimeout(500);

      // Get human messages
      const humanMessages = this.page.locator('[data-testid="user-message"]');
      const humanCount = await humanMessages.count();
      for (let i = 0; i < humanCount; i++) {
        const text = await humanMessages.nth(i).innerText().catch(() => '');
        if (text.trim()) {
          messages.push({ role: 'human', content: text.trim() });
        }
      }

      // Get assistant messages
      const assistantMessages = this.page.locator('.font-claude-response .standard-markdown');
      const assistantCount = await assistantMessages.count();
      for (let i = 0; i < assistantCount; i++) {
        const text = await assistantMessages.nth(i).innerText().catch(() => '');
        if (text.trim()) {
          messages.push({ role: 'assistant', content: text.trim() });
        }
      }

      log.info(`Retrieved ${messages.length} messages from conversation`);
    } catch (error) {
      log.warn('Error getting full conversation', { error: String(error) });
    }

    return messages;
  }

  // Analyze page state using visible content (for smart element finding)
  async analyzePageState(): Promise<{
    url: string;
    title: string;
    hasChat: boolean;
    hasResponse: boolean;
    isGenerating: boolean;
    visibleText: string;
  }> {
    const url = this.page.url();
    const title = await this.page.title();
    const hasChat = await this.exists('chat.chatInputContainer', { timeout: 1000 });
    const hasResponse = await this.page.locator('.font-claude-response').count() > 0;
    const isGenerating = await this.exists('chat.responseInProgress', { timeout: 500 });

    // Get visible text for context (limited to avoid huge payloads)
    const visibleText = await this.page.evaluate(() => {
      const main = document.querySelector('main') || document.body;
      return main.innerText.substring(0, 5000);
    });

    return { url, title, hasChat, hasResponse, isGenerating, visibleText };
  }

  // Get all messages in the conversation
  async getConversation(): Promise<ChatMessage[]> {
    const messages: ChatMessage[] = [];

    try {
      // This is tricky because message structure may vary
      // For now, try to get human and assistant messages separately

      const humanMessages = await this.page.locator('[data-testid="human-message"], [data-message-author="human"]').all();
      for (const msg of humanMessages) {
        const content = await msg.innerText().catch(() => '');
        if (content) {
          messages.push({ role: 'human', content });
        }
      }

      const assistantMessages = await this.page.locator('[data-testid="assistant-message"], [data-message-author="assistant"]').all();
      for (const msg of assistantMessages) {
        const content = await msg.innerText().catch(() => '');
        if (content) {
          messages.push({ role: 'assistant', content });
        }
      }

      // Note: messages may not be in chronological order
      // Would need more sophisticated logic to interleave properly
    } catch (error) {
      log.warn('Could not get full conversation', { error: String(error) });
    }

    return messages;
  }

  // Get list of conversations within current project
  async getProjectConversations(): Promise<ConversationInfo[]> {
    const conversations: ConversationInfo[] = [];

    try {
      // Extract project ID from current URL to filter conversations
      const currentUrl = this.page.url();
      const projectMatch = currentUrl.match(/\/project\/([^/?]+)/);
      const currentProjectId = projectMatch ? projectMatch[1] : null;

      // Look for conversations in the main content area only (not sidebar)
      // The main area typically has the project conversations list
      const mainArea = this.page.locator('main, [role="main"], .project-content').first();
      const convLinks = mainArea.locator('a[href*="/chat/"]');
      const count = await convLinks.count();

      const seen = new Set<string>(); // Dedupe by conversation ID

      for (let i = 0; i < count; i++) {
        const link = convLinks.nth(i);
        const href = await link.getAttribute('href');
        const text = await link.innerText().catch(() => '');

        if (href) {
          const match = href.match(/\/chat\/([^/?]+)/);
          const convId = match ? match[1] : null;

          // Skip duplicates
          if (convId && seen.has(convId)) continue;
          if (convId) seen.add(convId);

          // Parse title and timestamp
          const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
          const title = lines[0] || `Conversation ${i + 1}`;
          const lastMessage = lines.find(l => l.includes('ago') || l.includes('minute') || l.includes('hour'));

          conversations.push({
            id: convId || href,
            title,
            lastMessage,
            url: href.startsWith('http') ? href : `https://claude.ai${href}`,
          });
        }
      }

      log.info(`Found ${conversations.length} conversations in project`, { projectId: currentProjectId });
    } catch (error) {
      log.warn('Could not get project conversations', { error: String(error) });
    }

    return conversations;
  }

  // Open a specific conversation within a project
  async openConversation(conversationId: string): Promise<void> {
    return this.withScreenshot('open-conversation', async () => {
      if (conversationId.startsWith('http')) {
        await this.goto(conversationId);
      } else {
        await this.goto(`https://claude.ai/chat/${conversationId}`);
      }
      await this.waitForNavigation();
      log.action('opened conversation', { conversationId });
    });
  }

  // Stop a response in progress
  async stopResponse(): Promise<void> {
    const hasStopButton = await this.exists('chat.stopButton', { timeout: 2000 });
    if (hasStopButton) {
      await this.click('chat.stopButton');
      log.action('stopped response');
    }
  }

  // Check if input is ready (not disabled, response complete)
  async isInputReady(): Promise<boolean> {
    try {
      // Check if send button is visible (not stop button)
      const hasSendButton = await this.exists('chat.sendButton', { timeout: 2000 });
      const hasStopButton = await this.exists('chat.stopButton', { timeout: 500 });
      return hasSendButton && !hasStopButton;
    } catch {
      return false;
    }
  }

  // Select model (Opus, Sonnet, Haiku)
  async selectModel(model: 'opus' | 'sonnet' | 'haiku'): Promise<void> {
    return this.withScreenshot('select-model', async () => {
      await this.click('chat.modelSelector');
      await this.page.waitForTimeout(300);

      // Click the model option
      const modelText = model.charAt(0).toUpperCase() + model.slice(1);
      await this.page.locator(`button:has-text("${modelText}")`).first().click();
      await this.page.waitForTimeout(300);

      log.action('selected model', { model });
    });
  }

  // Toggle extended thinking
  async toggleExtendedThinking(): Promise<void> {
    await this.click('chat.extendedThinkingToggle');
    log.action('toggled extended thinking');
  }

  // Upload a file to attach to the chat message
  async attachFile(filePath: string): Promise<void> {
    return this.withScreenshot('attach-file', async () => {
      log.action('attaching file to chat', { filePath });

      // Find the file input (hidden)
      const fileInputSelectors = [
        '[data-testid="file-upload"]',
        'input[type="file"]',
        'input[aria-label="Upload files"]'
      ];

      let fileInput = null;
      for (const selector of fileInputSelectors) {
        const locator = this.page.locator(selector).first();
        if (await locator.count() > 0) {
          fileInput = locator;
          break;
        }
      }

      if (!fileInput) {
        throw new Error('Could not find file upload input in chat');
      }

      // Set the file
      await fileInput.setInputFiles(filePath);
      await this.page.waitForTimeout(1000);

      log.action('file attached to chat', { filePath });
    });
  }

  // Upload multiple files to attach to the chat message
  async attachFiles(filePaths: string[]): Promise<void> {
    return this.withScreenshot('attach-files', async () => {
      log.action('attaching files to chat', { count: filePaths.length });

      const fileInputSelectors = [
        '[data-testid="file-upload"]',
        'input[type="file"]',
        'input[aria-label="Upload files"]'
      ];

      let fileInput = null;
      for (const selector of fileInputSelectors) {
        const locator = this.page.locator(selector).first();
        if (await locator.count() > 0) {
          fileInput = locator;
          break;
        }
      }

      if (!fileInput) {
        throw new Error('Could not find file upload input in chat');
      }

      await fileInput.setInputFiles(filePaths);
      await this.page.waitForTimeout(1000 + filePaths.length * 500);

      log.action('files attached to chat', { count: filePaths.length });
    });
  }

  // Send a message with an attached file
  async sendMessageWithFile(message: string, filePath: string, waitForResponse: boolean = true): Promise<string | null> {
    return this.withScreenshot('send-message-with-file', async () => {
      // First attach the file
      await this.attachFile(filePath);

      // Then send the message
      return this.sendMessage(message, waitForResponse);
    });
  }

  // Add the last artifact to project knowledge
  async addArtifactToProject(): Promise<void> {
    return this.withScreenshot('add-artifact-to-project', async () => {
      log.action('adding artifact to project');

      // Look for the "Add to project" button
      const addButtonSelectors = [
        'button:has-text("Add to project")',
        'button[aria-label="Add to project"]',
        '[data-testid="add-to-project"]'
      ];

      let addButton = null;
      for (const selector of addButtonSelectors) {
        const locator = this.page.locator(selector).last(); // Get the last one (most recent artifact)
        if (await locator.count() > 0) {
          addButton = locator;
          break;
        }
      }

      if (!addButton) {
        throw new Error('Could not find "Add to project" button. Make sure there is an artifact visible.');
      }

      await addButton.click();
      await this.page.waitForTimeout(1000);

      log.action('artifact added to project');
    });
  }

  // Get artifacts from the current conversation
  async getArtifacts(): Promise<{ title: string; index: number }[]> {
    const artifacts: { title: string; index: number }[] = [];

    try {
      const artifactSelectors = [
        '[data-testid="artifact"]',
        '[class*="artifact"]',
        '[data-artifact-id]'
      ];

      for (const selector of artifactSelectors) {
        const elements = this.page.locator(selector);
        const count = await elements.count();

        if (count > 0) {
          for (let i = 0; i < count; i++) {
            const element = elements.nth(i);
            const title = await element.locator('h1, h2, [class*="title"]').first().innerText().catch(() => `Artifact ${i + 1}`);
            artifacts.push({ title, index: i });
          }
          break;
        }
      }
    } catch (error) {
      log.warn('Could not get artifacts', { error: String(error) });
    }

    return artifacts;
  }
}
