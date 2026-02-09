export type NewsLogLevel = 'debug' | 'info' | 'warn' | 'error';

interface RetryOptions {
  maxRetries: number;
  delayMs: number;
  backoff: boolean;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  delayMs: 500,
  backoff: true
};

export const newsLogger = {
  debug(message: string, context?: Record<string, unknown>) {
    writeLog('debug', message, context);
  },
  info(message: string, context?: Record<string, unknown>) {
    writeLog('info', message, context);
  },
  warn(message: string, context?: Record<string, unknown>) {
    writeLog('warn', message, context);
  },
  error(message: string, context?: Record<string, unknown>) {
    writeLog('error', message, context);
  }
};

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const config = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === config.maxRetries) {
        break;
      }

      const delay = config.backoff ? config.delayMs * attempt : config.delayMs;
      newsLogger.warn('[FinancialJuice] Retry failed, trying again', {
        attempt,
        maxRetries: config.maxRetries,
        delayMs: delay,
        error: lastError.message
      });
      await sleep(delay);
    }
  }

  throw lastError ?? new Error('Retry operation failed');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeLog(level: NewsLogLevel, message: string, context?: Record<string, unknown>) {
  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    context
  };

  const output = JSON.stringify(payload);
  if (level === 'error') {
    console.error(output);
    return;
  }
  if (level === 'warn') {
    console.warn(output);
    return;
  }
  console.log(output);
}
