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

    // Wait for streaming indicator to appear (response started)
    // The stop button appears when Claude is responding
    try {
      await this.exists('chat.responseInProgress', { timeout: 10000 });
      log.debug('Response started (stop button appeared)');
    } catch {
      // Response might have already completed quickly or not started
      log.debug('Stop button not found - response may have completed quickly');
    }

    // Wait for stop button to disappear (response complete)
    // Or for send button to become available again
    while (Date.now() - startTime < timeout) {
      const isStreaming = await this.exists('chat.responseInProgress', { timeout: 1000 });

      if (!isStreaming) {
        // Response complete - wait a bit for final render
        await this.page.waitForTimeout(500);
        break;
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
      // Try to find assistant messages using our selector
      const hasMessages = await this.exists('messages.assistantMessage', { timeout: 3000 });

      if (hasMessages) {
        const messages = await this.findAll('messages.assistantMessage');
        const count = await messages.count();

        if (count > 0) {
          const lastMessage = messages.nth(count - 1);
          return await lastMessage.innerText();
        }
      }

      // Fallback: try to find any response-like content
      // Look for prose content in the main area
      const proseContent = this.page.locator('main [class*="prose"]').last();
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
}
