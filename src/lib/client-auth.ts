export interface ClientSessionResponse {
  authenticated: boolean;
  bypass: boolean;
  mockDevSession: boolean;
}

export interface ClientAuthState {
  loading: boolean;
  authenticated: boolean;
  bypass: boolean;
  mockDevSession: boolean;
}

export const INITIAL_CLIENT_AUTH_STATE: ClientAuthState = {
  loading: true,
  authenticated: false,
  bypass: false,
  mockDevSession: false,
};

export const DEV_BYPASS_AUTH_STATE: ClientAuthState = {
  loading: false,
  authenticated: true,
  bypass: true,
  mockDevSession: true,
};

export const SESSION_FETCH_TIMEOUT_MS = 5000;

export function createDevBypassAuthState(): ClientAuthState {
  return { ...DEV_BYPASS_AUTH_STATE };
}

export function mapSessionResponseToAuthState(data: ClientSessionResponse): ClientAuthState {
  return {
    loading: false,
    authenticated: Boolean(data.authenticated),
    bypass: Boolean(data.bypass),
    mockDevSession: Boolean(data.mockDevSession),
  };
}

export function createUnauthenticatedAuthState(): ClientAuthState {
  return {
    loading: false,
    authenticated: false,
    bypass: false,
    mockDevSession: false,
  };
}

export function canShowUploadUI(auth: ClientAuthState): boolean {
  return !auth.loading && auth.authenticated;
}

export function getUploadUIHiddenReason(auth: ClientAuthState): string | null {
  if (auth.loading) return "session-loading";
  if (!auth.authenticated) return "unauthenticated-client-session";
  return null;
}

export function logClientAuthDev(message: string, ...details: unknown[]): void {
  if (process.env.NODE_ENV !== "development") return;
  console.info(`[sfg-auth][client] ${message}`, ...details);
}

export function logUploadUIStatus(auth: ClientAuthState): void {
  if (process.env.NODE_ENV !== "development") return;

  const reason = getUploadUIHiddenReason(auth);
  if (reason) {
    console.warn(
      `[sfg-upload] Upload UI not available: ${reason}.`,
      `authenticated=${auth.authenticated}`,
      `bypass=${auth.bypass}`,
      `mockDevSession=${auth.mockDevSession}`,
      `loading=${auth.loading}`
    );
    return;
  }

  console.info(
    "[sfg-upload] Upload UI ready.",
    auth.bypass ? "(LOCAL_AUTH_BYPASS dev session)" : "(authenticated session)"
  );
}

export function logUploadRenderDecision(auth: ClientAuthState, showUpload: boolean): void {
  if (process.env.NODE_ENV !== "development") return;
  console.info(
    "[sfg-upload] render decision:",
    showUpload ? "show-upload-card" : getUploadUIHiddenReason(auth) ?? "sign-in-required"
  );
}
