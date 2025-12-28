#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { tools, handleTool } from './tools/index.js';
import { log } from './utils/logger.js';
import { closeBrowser } from './browser.js';

const server = new Server(
  {
    name: 'claude_project_mcp',
    version: '1.0.3',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  log.info(`Tool called: ${name}`, { args });

  const result = await handleTool(name, args || {});

  return {
    content: [
      {
        type: 'text',
        text: result,
      },
    ],
  };
});

// Graceful shutdown
async function shutdown() {
  log.info('Shutting down...');
  await closeBrowser();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start server
async function main() {
  log.info('Starting Claude Project MCP server');

  const transport = new StdioServerTransport();
  await server.connect(transport);

  log.info('Server connected and ready');
}

main().catch((error) => {
  log.error('Server failed to start', { error: String(error) });
  process.exit(1);
});
