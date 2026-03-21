export type AutomationGuardEnv = Record<string, string | undefined>;
export type AccountMode = 'PAPER' | 'LIVE';

const EASTERN_TIME_ZONE = 'America/New_York';

export function isUsRegularMarketHours(date: Date): boolean {
  const parts = getEasternParts(date);
  if (!isWeekday(parts.weekday)) {
    return false;
  }

  const minutes = parts.hour * 60 + parts.minute;
  return minutes >= 9 * 60 + 30 && minutes < 16 * 60;
}

export function isCreditSpreadExecutionWindow(date: Date): boolean {
  if (!isUsRegularMarketHours(date)) {
    return false;
  }

  const parts = getEasternParts(date);
  const minutes = parts.hour * 60 + parts.minute;
  if (minutes > 15 * 60 + 45) {
    return false;
  }

  return minutes >= 9 * 60 + 30 && parts.minute % 15 === 0;
}

export function shouldRunCreditSpreadAutomation(
  date: Date,
  env: AutomationGuardEnv = process.env
): boolean {
  return loadAutomationFlags(env).enabled && isCreditSpreadExecutionWindow(date);
}

export function assertAccountModeAllowed(
  accountMode: AccountMode,
  env: AutomationGuardEnv = process.env
) {
  const flags = loadAutomationFlags(env);
  if (flags.paperOnly && accountMode === 'LIVE') {
    throw new Error('paper-only automation blocks live-account calls');
  }
}

export function loadAutomationFlags(env: AutomationGuardEnv = process.env) {
  return {
    enabled: parseBoolean(env.AUTO_CREDIT_SPREAD_AUTOMATION_ENABLED, false),
    paperOnly: parseBoolean(env.AUTO_CREDIT_SPREAD_PAPER_ONLY, true),
  };
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === '') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function getEasternParts(date: Date) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TIME_ZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);

  return {
    weekday: parts.find((part) => part.type === 'weekday')?.value ?? 'Sun',
    hour: Number(parts.find((part) => part.type === 'hour')?.value ?? '0'),
    minute: Number(parts.find((part) => part.type === 'minute')?.value ?? '0'),
  };
}

function isWeekday(weekday: string): boolean {
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(weekday);
}
