import { Page } from 'playwright';
import { BasePage } from './base.js';
import { log } from '../utils/logger.js';
import path from 'path';

export interface KnowledgeFile {
  name: string;
  type?: string;
  lines?: string;
}

export class KnowledgePage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  // Check if we're on a project page with files section
  async hasFilesSection(): Promise<boolean> {
    return this.exists('projectFiles.filesSection', { timeout: 3000 });
  }

  // List files in project knowledge base
  async listFiles(): Promise<KnowledgeFile[]> {
    return this.withScreenshot('list-knowledge-files', async () => {
      const files: KnowledgeFile[] = [];

      // Look for file thumbnails
      const hasFiles = await this.exists('projectFiles.fileThumbnail', { timeout: 3000 });
      if (!hasFiles) {
        log.info('No files found in project knowledge base');
        return files;
      }

      const fileThumbnails = await this.findAll('projectFiles.fileThumbnail');
      const count = await fileThumbnails.count();

      for (let i = 0; i < count; i++) {
        const thumbnail = fileThumbnails.nth(i);
        const text = await thumbnail.innerText().catch(() => '');

        // Parse the text to extract file info
        // Format is typically: "filename.ext\n123 lines\nmd/pdf/etc"
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

        let name = lines[0] || `File ${i + 1}`;
        let type: string | undefined;
        let fileLines: string | undefined;

        // Check for file type indicators
        for (const line of lines) {
          if (line.match(/^\d+ lines?$/)) {
            fileLines = line;
          } else if (line.match(/^(md|pdf|doc|txt|docx|csv|json|xml|html)$/i)) {
            type = line.toUpperCase();
          } else if (line.includes('DOC') || line.includes('PDF') || line.includes('MD')) {
            type = line;
          }
        }

        // Clean up name - remove "Select file" suffix if present
        name = name.replace(/Select file$/i, '').trim();

        files.push({
          name,
          type,
          lines: fileLines,
        });
      }

      log.info(`Found ${files.length} files in knowledge base`);
      return files;
    });
  }

  // Upload a file to project knowledge base
  async uploadFile(filePath: string): Promise<void> {
    return this.withScreenshot('upload-file', async () => {
      const fileName = path.basename(filePath);
      log.action('uploading file', { fileName, filePath });

      // Find the file input
      const fileInput = await this.find('projectFiles.fileUploadInput', { timeout: 5000 });

      // Set the file
      await fileInput.setInputFiles(filePath);

      // Wait for upload to complete
      await this.page.waitForTimeout(3000);

      log.action('file uploaded', { fileName });
    });
  }

  // Upload multiple files
  async uploadFiles(filePaths: string[]): Promise<void> {
    return this.withScreenshot('upload-files', async () => {
      log.action('uploading files', { count: filePaths.length });

      const fileInput = await this.find('projectFiles.fileUploadInput', { timeout: 5000 });
      await fileInput.setInputFiles(filePaths);

      // Wait for uploads to complete
      await this.page.waitForTimeout(3000 + (filePaths.length * 1000));

      log.action('files uploaded');
    });
  }

  // Click the add files button (opens upload dialog/dropdown)
  async clickAddFiles(): Promise<void> {
    return this.withScreenshot('click-add-files', async () => {
      await this.click('projectFiles.addFilesButton');
      await this.page.waitForTimeout(300);
      log.action('clicked add files button');
    });
  }

  // Delete a file from knowledge base by name
  async deleteFile(fileName: string): Promise<void> {
    return this.withScreenshot('delete-file', async () => {
      log.action('deleting file', { fileName });

      // Find the file thumbnail containing the filename
      const fileThumbnails = await this.findAll('projectFiles.fileThumbnail');
      const count = await fileThumbnails.count();

      for (let i = 0; i < count; i++) {
        const thumbnail = fileThumbnails.nth(i);
        const text = await thumbnail.innerText().catch(() => '');

        if (text.toLowerCase().includes(fileName.toLowerCase())) {
          // Click to select the file first
          await thumbnail.click();
          await this.page.waitForTimeout(300);

          // Look for delete option in context menu or toolbar
          const deleteButton = this.page.locator('button:has-text("Delete"), button:has-text("Remove"), button[aria-label*="delete" i]').first();
          if (await deleteButton.count() > 0) {
            await deleteButton.click();
            await this.page.waitForTimeout(500);

            // Confirm if needed
            const confirmButton = this.page.locator('[role="dialog"] button:has-text("Delete"), [role="alertdialog"] button:has-text("Delete")').first();
            if (await confirmButton.count() > 0) {
              await confirmButton.click();
            }
          }

          await this.page.waitForTimeout(1000);
          log.action('file deleted', { fileName });
          return;
        }
      }

      throw new Error(`File not found in knowledge base: ${fileName}`);
    });
  }

  // Check if a specific file exists in knowledge base
  async fileExists(fileName: string): Promise<boolean> {
    const files = await this.listFiles();
    return files.some(f => f.name.toLowerCase().includes(fileName.toLowerCase()));
  }

  // Get file count
  async getFileCount(): Promise<number> {
    const files = await this.listFiles();
    return files.length;
  }

  // Read file contents by clicking on it and scraping the viewer
  async readFileContent(fileName: string): Promise<string> {
    return this.withScreenshot('read-file-content', async () => {
      log.action('reading file content', { fileName });

      // Find the file thumbnail containing the filename
      const fileThumbnails = await this.findAll('projectFiles.fileThumbnail');
      const count = await fileThumbnails.count();

      for (let i = 0; i < count; i++) {
        const thumbnail = fileThumbnails.nth(i);
        const text = await thumbnail.innerText().catch(() => '');

        if (text.toLowerCase().includes(fileName.toLowerCase())) {
          // Click to open the file viewer
          await thumbnail.click();
          await this.page.waitForTimeout(1000);

          // Wait for viewer/modal to open
          // Try different possible content containers
          let content = '';

          // Try modal/dialog first
          const dialog = this.page.locator('[role="dialog"], [role="document"]').first();
          if (await dialog.count() > 0) {
            // Look for content within the dialog
            const contentArea = dialog.locator('pre, code, [class*="content"], [class*="preview"], textarea').first();
            if (await contentArea.count() > 0) {
              content = await contentArea.innerText();
            } else {
              content = await dialog.innerText();
            }
          }

          // Try looking for a preview pane that might have opened
          if (!content) {
            const previewPane = this.page.locator('[class*="preview"], [class*="viewer"], [class*="file-content"]').first();
            if (await previewPane.count() > 0) {
              content = await previewPane.innerText();
            }
          }

          // Try getting content from any code/pre blocks that appeared
          if (!content) {
            const codeBlock = this.page.locator('main pre, main code, main [class*="prose"]').last();
            if (await codeBlock.count() > 0) {
              content = await codeBlock.innerText();
            }
          }

          // Close any dialog that opened
          const closeButton = this.page.locator('[role="dialog"] button[aria-label*="close" i], [role="dialog"] button:has(svg)').first();
          if (await closeButton.count() > 0) {
            await closeButton.click();
            await this.page.waitForTimeout(300);
          } else {
            // Try pressing Escape to close
            await this.page.keyboard.press('Escape');
            await this.page.waitForTimeout(300);
          }

          if (content) {
            log.action('file content read', { fileName, contentLength: content.length });
            return content;
          } else {
            throw new Error(`Could not extract content from file: ${fileName}. The file viewer may have a different structure.`);
          }
        }
      }

      throw new Error(`File not found in knowledge base: ${fileName}`);
    });
  }

  // Create a new text file in the project
  async createTextFile(fileName: string, content: string): Promise<void> {
    return this.withScreenshot('create-text-file', async () => {
      log.action('creating text file', { fileName, contentLength: content.length });

      // Create a temporary file
      const os = await import('os');
      const fs = await import('fs');
      const tempDir = os.tmpdir();
      const tempPath = path.join(tempDir, fileName);

      // Write content to temp file
      fs.writeFileSync(tempPath, content, 'utf-8');

      try {
        // Upload the temp file
        await this.uploadFile(tempPath);
        log.action('text file created and uploaded', { fileName });
      } finally {
        // Clean up temp file
        try {
          fs.unlinkSync(tempPath);
        } catch {
          // Ignore cleanup errors
        }
      }
    });
  }
}
