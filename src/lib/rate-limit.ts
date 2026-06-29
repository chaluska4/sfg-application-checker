const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const attemptsByIp = new Map<string, RateLimitRecord>();

function getRecord(ip: string, now: number): RateLimitRecord {
  const existing = attemptsByIp.get(ip);
  if (!existing || now >= existing.resetAt) {
    const record = { count: 0, resetAt: now + WINDOW_MS };
    attemptsByIp.set(ip, record);
    return record;
  }
  return existing;
}

export function checkLoginRateLimit(ip: string): { allowed: boolean } {
  const now = Date.now();
  const record = getRecord(ip, now);
  return { allowed: record.count < MAX_ATTEMPTS };
}

export function recordFailedLogin(ip: string): void {
  const now = Date.now();
  const record = getRecord(ip, now);
  record.count += 1;
}

export function clearLoginRateLimit(ip: string): void {
  attemptsByIp.delete(ip);
}
