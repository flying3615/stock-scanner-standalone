import { spawn } from 'node:child_process';
import { newsLogger } from './utils.js';
import type {
  FinancialJuiceRefreshedToken,
  FinancialJuiceTokenRefresher,
  FinancialJuiceTokenRefresherContext
} from './types.js';

interface EnvTokenRefresherConfig {
  getToken: () => string | undefined | null;
  name?: string;
  softTtlMs?: number;
  hardTtlMs?: number;
}

interface CommandTokenRefresherConfig {
  command: string;
  args?: string[];
  cwd?: string;
  timeoutMs?: number;
  env?: Record<string, string | undefined>;
  output?: 'plain' | 'json';
  tokenField?: string;
  softTtlMs?: number;
  hardTtlMs?: number;
  name?: string;
}

interface BrowserTokenRefresherConfig {
  getEmail: () => string | undefined | null;
  getPassword: () => string | undefined | null;
  name?: string;
  homeUrl?: string;
  timeoutMs?: number;
  settleMs?: number;
  headless?: boolean;
  userAgent?: string;
  softTtlMs?: number;
  hardTtlMs?: number;
}

interface DisabledTokenRefresherConfig {
  name?: string;
  message?: string;
}

const DEFAULT_FJ_HOME_URL = 'https://www.financialjuice.com/home/';
const DEFAULT_FJ_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

export function createEnvTokenRefresher(config: EnvTokenRefresherConfig): FinancialJuiceTokenRefresher {
  return {
    name: config.name || 'env-token',
    async refreshToken(_ctx: FinancialJuiceTokenRefresherContext): Promise<FinancialJuiceRefreshedToken> {
      const token = config.getToken()?.trim();
      if (!token) {
        throw new Error('FJ token is empty from env/token source');
      }
      return {
        token,
        softTtlMs: config.softTtlMs,
        hardTtlMs: config.hardTtlMs
      };
    }
  };
}

export function createFinancialJuiceBrowserTokenRefresher(
  config: BrowserTokenRefresherConfig
): FinancialJuiceTokenRefresher {
  const timeoutMs = Math.max(config.timeoutMs ?? 60_000, 10_000);
  const settleMs = Math.max(config.settleMs ?? 15_000, 3_000);
  const homeUrl = config.homeUrl || DEFAULT_FJ_HOME_URL;
  const userAgent = config.userAgent || DEFAULT_FJ_USER_AGENT;
  const headless = config.headless !== false;

  return {
    name: config.name || 'financialjuice-browser',
    async refreshToken(_ctx: FinancialJuiceTokenRefresherContext): Promise<FinancialJuiceRefreshedToken> {
      const email = config.getEmail()?.trim();
      const password = config.getPassword()?.trim();

      if (!email || !password) {
        throw new Error('FJ_EMAIL or FJ_PASSWORD is missing');
      }

      const playwright = await importPlaywright();
      const chromium = playwright.chromium;
      if (!chromium) {
        throw new Error('Playwright chromium is unavailable');
      }

      const browser = await chromium.launch({ headless });
      let token = '';

      try {
        const context = await browser.newContext({ userAgent });
        const page = await context.newPage();

        const onRequest = (request: any) => {
          const requestUrl = safeCall(() => request.url(), '');
          const extracted = extractTokenFromRequestUrl(requestUrl);
          if (extracted) {
            token = extracted;
          }
        };
        page.on('request', onRequest);

        await page.goto(homeUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
        await maybeLogin(page, email, password, timeoutMs);

        const deadline = Date.now() + settleMs;
        while (!token && Date.now() < deadline) {
          await page.waitForTimeout(500);
        }

        if (!token) {
          throw new Error('Failed to capture FinancialJuice token from browser requests');
        }

        return {
          token,
          softTtlMs: config.softTtlMs,
          hardTtlMs: config.hardTtlMs
        };
      } finally {
        await browser.close();
      }
    }
  };
}

export function createCommandTokenRefresher(config: CommandTokenRefresherConfig): FinancialJuiceTokenRefresher {
  const outputFormat = config.output || 'plain';
  const tokenField = config.tokenField || 'token';
  const timeoutMs = Math.max(config.timeoutMs ?? 60_000, 1_000);

  return {
    name: config.name || `command:${config.command}`,
    async refreshToken(_ctx: FinancialJuiceTokenRefresherContext): Promise<FinancialJuiceRefreshedToken> {
      const output = await runCommand({
        command: config.command,
        args: config.args || [],
        cwd: config.cwd,
        timeoutMs,
        env: config.env
      });

      if (outputFormat === 'json') {
        const payload = parseJsonOutput(output.stdout);
        const token = getTokenFromJson(payload, tokenField);
        return {
          token,
          softTtlMs: readOptionalNumber(payload.softTtlMs) ?? config.softTtlMs,
          hardTtlMs: readOptionalNumber(payload.hardTtlMs) ?? config.hardTtlMs
        };
      }

      const token = output.stdout.trim();
      if (!token) {
        throw new Error('Command output is empty; expected token in stdout');
      }
      return {
        token,
        softTtlMs: config.softTtlMs,
        hardTtlMs: config.hardTtlMs
      };
    }
  };
}

export function createDisabledTokenRefresher(
  config: DisabledTokenRefresherConfig = {}
): FinancialJuiceTokenRefresher {
  const message = config.message || 'Token refresher is not configured. Please set token manually.';
  return {
    name: config.name || 'disabled-token-refresher',
    async refreshToken(_ctx: FinancialJuiceTokenRefresherContext): Promise<FinancialJuiceRefreshedToken> {
      throw new Error(message);
    }
  };
}

async function runCommand(params: {
  command: string;
  args: string[];
  cwd?: string;
  timeoutMs: number;
  env?: Record<string, string | undefined>;
}): Promise<{ stdout: string; stderr: string }> {
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(params.command, params.args, {
        cwd: params.cwd,
        env: {
          ...process.env,
          ...removeUndefinedEnv(params.env)
        },
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`Token refresh command timeout after ${params.timeoutMs}ms`));
      }, params.timeoutMs);

      child.stdout.on('data', (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      child.on('close', (code) => {
        clearTimeout(timeout);
        if (code !== 0) {
          reject(new Error(`Token refresh command exited with code ${code}: ${stderr.trim() || 'no stderr'}`));
          return;
        }
        resolve({ stdout, stderr });
      });
    });
  } catch (error) {
    newsLogger.error('[FinancialJuice] Token refresh command failed', {
      command: params.command,
      args: params.args,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

function parseJsonOutput(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('Command returned empty stdout; expected JSON payload');
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('JSON payload is not an object');
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error(`Invalid JSON output from token refresh command: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function getTokenFromJson(payload: Record<string, unknown>, field: string): string {
  const value = payload[field];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`JSON output missing token field "${field}"`);
  }
  return value.trim();
}

function readOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return null;
}

function removeUndefinedEnv(env?: Record<string, string | undefined>): Record<string, string> {
  if (!env) {
    return {};
  }
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') {
      next[key] = value;
    }
  }
  return next;
}

async function importPlaywright(): Promise<any> {
  const moduleName = 'playwright';
  try {
    return await import(moduleName);
  } catch {
    throw new Error('Playwright is not installed. Run: npm install playwright && npx playwright install chromium');
  }
}

function extractTokenFromRequestUrl(requestUrl: string): string {
  if (!requestUrl) {
    return '';
  }
  if (!requestUrl.includes('FJService.asmx')) {
    return '';
  }
  if (!requestUrl.includes('GetPreviousNews') && !requestUrl.includes('Startup')) {
    return '';
  }

  try {
    const url = new URL(requestUrl);
    const info = url.searchParams.get('info') || '';
    const token = info.replace(/^"+|"+$/g, '').trim();
    if (token.length < 40) {
      return '';
    }
    return token;
  } catch {
    return '';
  }
}

async function maybeLogin(page: any, email: string, password: string, timeoutMs: number): Promise<void> {
  const loginButtonSelectors = ['a.login-btn', 'button:has-text("Login")', 'text=Login'];
  const emailSelectors = ['input[placeholder*="Email"]', 'input[type="email"]', 'input[name*="email"]'];
  const passwordSelectors = ['input[type="password"]', 'input[name*="password"]'];
  const submitSelectors = [
    'button[type="submit"]',
    'button:has-text("Sign In")',
    'button:has-text("Login")',
    'button:has-text("Log in")'
  ];

  const loginVisible = await isAnySelectorVisible(page, loginButtonSelectors, 2_000);
  if (!loginVisible) {
    return;
  }

  await clickFirstVisible(page, loginButtonSelectors, timeoutMs);
  await page.waitForTimeout(1_000);
  await fillFirstVisible(page, emailSelectors, email, timeoutMs);
  await fillFirstVisible(page, passwordSelectors, password, timeoutMs);

  const submitted = await clickFirstVisible(page, submitSelectors, 2_500);
  if (!submitted) {
    await page.keyboard.press('Enter');
  }

  await page.waitForTimeout(5_000);
}

async function isAnySelectorVisible(page: any, selectors: string[], timeoutMs: number): Promise<boolean> {
  for (const selector of selectors) {
    try {
      const locator = page.locator(selector).first();
      const visible = await locator.isVisible({ timeout: timeoutMs });
      if (visible) {
        return true;
      }
    } catch {
      // Ignore selector mismatch.
    }
  }
  return false;
}

async function clickFirstVisible(page: any, selectors: string[], timeoutMs: number): Promise<boolean> {
  for (const selector of selectors) {
    try {
      const locator = page.locator(selector).first();
      const visible = await locator.isVisible({ timeout: timeoutMs });
      if (!visible) {
        continue;
      }
      await locator.click({ timeout: timeoutMs, force: true });
      return true;
    } catch {
      // Try next selector.
    }
  }
  return false;
}

async function fillFirstVisible(page: any, selectors: string[], value: string, timeoutMs: number): Promise<boolean> {
  for (const selector of selectors) {
    try {
      const locator = page.locator(selector).first();
      const visible = await locator.isVisible({ timeout: timeoutMs });
      if (!visible) {
        continue;
      }
      await locator.fill(value, { timeout: timeoutMs });
      return true;
    } catch {
      // Try next selector.
    }
  }
  return false;
}

function safeCall<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}
