import { timingSafeEqual } from "node:crypto";

/**
 * Server-only password verification against APP_ACCESS_PASSWORD.
 * Uses timing-safe comparison when lengths match.
 */
export function verifyPassword(password: string): boolean {
  const expected = process.env.APP_ACCESS_PASSWORD;
  if (!expected || !password) return false;

  const passwordBuf = Buffer.from(password, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");

  if (passwordBuf.length !== expectedBuf.length) return false;

  return timingSafeEqual(passwordBuf, expectedBuf);
}

export function isAuthConfigured(): boolean {
  const secret = process.env.AUTH_SECRET;
  const password = process.env.APP_ACCESS_PASSWORD;
  return Boolean(secret && secret.length >= 32 && password && password.length > 0);
}
