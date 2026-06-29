let bypassWarningLogged = false;

/**
 * Local development only. Never enabled in production regardless of env value.
 */
export function isLocalAuthBypassEnabled(): boolean {
  if (process.env.NODE_ENV !== "development") return false;
  return (process.env["LOCAL_AUTH_BYPASS"] ?? "").trim().toLowerCase() === "true";
}

export function logLocalAuthBypassWarningOnce(): void {
  if (!isLocalAuthBypassEnabled() || bypassWarningLogged) return;
  bypassWarningLogged = true;
  console.warn(
    "[sfg-auth] LOCAL_AUTH_BYPASS is enabled — authentication is disabled for local development only. Do not enable in production."
  );
}

/** @internal Test helper */
export function resetLocalAuthBypassWarningForTests(): void {
  bypassWarningLogged = false;
}
