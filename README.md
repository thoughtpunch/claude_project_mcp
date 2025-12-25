# Claude Project MCP (Proof of Concept)

> **DISCLAIMER**: This is an unofficial, experimental proof-of-concept for research and educational purposes only. It is not affiliated with, endorsed by, or supported by Anthropic. This project automates browser interactions with claude.ai, which may violate Anthropic's Terms of Service. Use at your own risk and only for personal research/learning. Not intended for production use.

## What This Is

A Model Context Protocol (MCP) server that enables programmatic interaction with Claude.ai Projects through browser automation. This allows exploration of how an AI coding assistant could leverage the context, memory, and knowledge files stored in Claude.ai Projects.

**Research Questions Explored:**
- Can an MCP bridge provide useful context from Claude.ai Projects to other tools?
- How might project memory and knowledge files enhance AI assistant capabilities?
- What are the challenges of browser automation for AI-to-AI communication?

## Legal & Ethical Considerations

- **Unofficial**: This project has no affiliation with Anthropic
- **Terms of Service**: Browser automation may violate claude.ai ToS - review before use
- **Personal Use Only**: Intended for individual research and learning
- **No Warranty**: Provided "as is" without any guarantees
- **Rate Limiting**: Respect claude.ai's infrastructure; don't abuse
- **Data Privacy**: Your claude.ai data passes through this automation
- **Not Production Ready**: Selectors break when UI changes; no reliability guarantees

## Architecture Overview

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   Claude Code   │  MCP    │  This Server     │ Browser │   claude.ai     │
│   (or other     │◄───────►│  (Playwright     │◄───────►│   (Projects,    │
│    MCP client)  │         │   automation)    │         │    Memory,      │
│                 │         │                  │         │    Files)       │
└─────────────────┘         └──────────────────┘         └─────────────────┘
```

The server uses Playwright to automate a Chrome browser, maintaining a persistent login session. It exposes MCP tools that translate into browser actions on claude.ai.

## Capabilities (21 Tools)

### Project Context Tools
| Tool | Description |
|------|-------------|
| `get_project_details` | Retrieve project name, description, memory, instructions, file count |
| `get_project_memory` | Extract Memory/Context sections (Purpose, Current state, Key learnings, etc.) |
| `get_project_instructions` | Get custom instructions configured for the project |
| `set_project_instructions` | Update project custom instructions |

### Knowledge Base Tools
| Tool | Description |
|------|-------------|
| `list_project_files` | List all files in project knowledge base |
| `read_file` | Read contents of a knowledge file |
| `create_file` | Create new text file in knowledge base |
| `upload_file` | Upload local file to knowledge base |
| `delete_file` | Remove file from knowledge base |

### Chat Tools
| Tool | Description |
|------|-------------|
| `send_message` | Send message to project chat, receive response with full project context |
| `get_response` | Retrieve last assistant response |
| `list_conversations` | List conversations within a project |
| `open_conversation` | Open specific conversation |

### Project Management Tools
| Tool | Description |
|------|-------------|
| `list_projects` | List all projects |
| `open_project` | Open project, return current state |
| `create_project` | Create new project |
| `delete_project` | Delete project (requires confirmation) |

### Debug Tools
| Tool | Description |
|------|-------------|
| `take_screenshot` | Capture current browser state |
| `validate_selectors` | Check if UI selectors still work |
| `reload_selectors` | Reload selectors after editing |
| `get_page_info` | Get current page context |
| `close_browser` | Close browser instance |

## Installation

### Prerequisites
- Node.js 18+
- Chrome browser

### Setup

```bash
# Clone and install
git clone <repo>
cd claude_project_mcp
npm install
npx playwright install chromium
npm run build

# Login to claude.ai (one-time)
npm run inspect
# Browser opens → login to claude.ai → press Enter to close
```

### Configuration

Add to your MCP client configuration (e.g., Claude Code's `~/.claude.json`):

```json
{
  "mcpServers": {
    "claude-project": {
      "command": "node",
      "args": ["/absolute/path/to/claude_project_mcp/dist/server.js"]
    }
  }
}
```

## Usage Examples

### Get Project Context
```
# Full project details
get_project_details(project="My Research Project")

# Just the memory/context
get_project_memory(project="My Research Project")
→ Returns: Purpose & context, Current state, Key learnings, etc.
```

### Work with Knowledge Files
```
# List files
list_project_files(project="My Research Project")
→ Returns: [{name: "notes.md", type: "MD", lines: "150 lines"}, ...]

# Read a file
read_file(project="My Research Project", file_name="notes.md")
→ Returns file contents

# Create a new file
create_file(
  project="My Research Project",
  file_name="summary.md",
  content="# Summary\n\nKey findings..."
)
```

### Chat with Project Context
```
# Send message - Claude.ai responds with full project context
send_message(
  project="My Research Project",
  message="Based on the uploaded documents, summarize the key themes"
)
→ Returns Claude's response (informed by project memory + files)
```

## Debugging

### When UI Changes Break Things

Claude.ai's UI updates frequently. When tools fail:

1. **Take a screenshot** to see current state:
   ```
   take_screenshot(label="debug")
   ```

2. **Validate selectors** to find what's broken:
   ```
   validate_selectors(category="chat")
   ```

3. **Interactive inspection**:
   ```bash
   npm run inspect
   # Use DevTools to find new selectors
   ```

4. **Update selectors.json** with working selectors

5. **Reload**:
   ```
   reload_selectors()
   ```

### Headed Mode (See the Browser)

```bash
HEADED=true SLOW_MO=500 npm run dev
```

## Project Structure

```
├── src/
│   ├── server.ts              # MCP server entry point
│   ├── browser.ts             # Browser lifecycle management
│   ├── selectors.ts           # Fallback selector engine
│   ├── pages/
│   │   ├── base.ts            # Base page utilities
│   │   ├── projects.ts        # Project list/navigation
│   │   ├── project-settings.ts # Memory, instructions
│   │   ├── chat.ts            # Chat interactions
│   │   └── knowledge.ts       # File management
│   ├── tools/
│   │   └── index.ts           # MCP tool definitions & handlers
│   └── utils/
│       ├── logger.ts          # Logging
│       └── screenshot.ts      # Screenshot capture
├── selectors.json             # UI selectors (edit when UI changes!)
├── screenshots/               # Debug screenshots
├── scraped/                   # Page structure data
├── package.json
└── tsconfig.json
```

## Selectors Architecture

All UI selectors are centralized in `selectors.json` with fallback strategies:

```json
{
  "chat": {
    "sendButton": {
      "description": "Button to send chat message",
      "strategies": [
        "button[aria-label='Send message']",
        "[data-testid='send-button']"
      ]
    }
  }
}
```

When locating elements:
1. Each strategy is tried in order
2. First successful match is used
3. If all fail, detailed error shows what was attempted
4. Screenshot is automatically captured on failure

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CHROME_PROFILE` | Chrome user data directory | `~/.claude-project-mcp/chrome-profile` |
| `HEADED` | Show browser window | `false` |
| `SLOW_MO` | Slow down actions (ms) | `0` |
| `TIMEOUT` | Default timeout (ms) | `30000` |
| `LOG_LEVEL` | Logging level | `info` |

## Known Limitations

1. **Fragile Selectors**: UI changes require selector updates
2. **No Streaming**: Waits for complete responses (no streaming support)
3. **Single Session**: One browser instance at a time
4. **Rate Limits**: May hit claude.ai rate limits with heavy use
5. **File Reading**: Depends on file viewer UI structure
6. **Memory Editing**: Read-only for memory (editing is complex)

## Research Applications

This proof-of-concept could inform research on:

- **Context bridging**: How can AI assistants share context across platforms?
- **Knowledge augmentation**: How do curated knowledge bases improve AI responses?
- **Multi-agent architectures**: Can AI tools collaborate through shared project contexts?
- **Automation patterns**: What are best practices for AI-to-AI communication?

## Contributing

This is a research prototype. If you find it useful for learning:

1. Fork for your own experiments
2. Document what you learn
3. Share findings (without violating any ToS)

## License

MIT License - see LICENSE file.

**Remember**: This is unofficial software for research purposes. The author(s) are not responsible for any misuse or violations of third-party terms of service.

---

*This project exists to explore ideas about AI tool integration and is not intended to circumvent any platform's intended usage patterns or business model.*
