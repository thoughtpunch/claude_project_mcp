type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLogLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[currentLogLevel];
}

function formatLog(entry: LogEntry): string {
  const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}]`;
  const dataStr = entry.data ? ` ${JSON.stringify(entry.data)}` : '';
  return `${prefix} ${entry.message}${dataStr}`;
}

function createLogEntry(level: LogLevel, message: string, data?: Record<string, unknown>): LogEntry {
  return {
    level,
    message,
    timestamp: new Date().toISOString(),
    data,
  };
}

function logToStderr(entry: LogEntry): void {
  if (!shouldLog(entry.level)) return;
  // MCP servers should log to stderr, not stdout
  console.error(formatLog(entry));
}

export const log = {
  debug: (message: string, data?: Record<string, unknown>) => {
    logToStderr(createLogEntry('debug', message, data));
  },

  info: (message: string, data?: Record<string, unknown>) => {
    logToStderr(createLogEntry('info', message, data));
  },

  warn: (message: string, data?: Record<string, unknown>) => {
    logToStderr(createLogEntry('warn', message, data));
  },

  error: (message: string, data?: Record<string, unknown>) => {
    logToStderr(createLogEntry('error', message, data));
  },

  // Log a selector attempt for debugging
  selector: (action: string, selectorKey: string, strategy: string, success: boolean) => {
    const level = success ? 'debug' : 'warn';
    log[level](`Selector ${action}`, {
      key: selectorKey,
      strategy,
      success,
    });
  },

  // Log a page action
  action: (action: string, details?: Record<string, unknown>) => {
    log.info(`Action: ${action}`, details);
  },
};
