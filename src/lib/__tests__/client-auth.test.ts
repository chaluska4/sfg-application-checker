import { describe, expect, it, vi, afterEach } from "vitest";
import {
  canShowUploadUI,
  createDevBypassAuthState,
  createUnauthenticatedAuthState,
  getUploadUIHiddenReason,
  INITIAL_CLIENT_AUTH_STATE,
  logUploadUIStatus,
  mapSessionResponseToAuthState,
  SESSION_FETCH_TIMEOUT_MS,
} from "@/lib/client-auth";

describe("client auth upload UI", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows upload when dev bypass mock session is active", () => {
    const auth = createDevBypassAuthState();
    expect(canShowUploadUI(auth)).toBe(true);
    expect(getUploadUIHiddenReason(auth)).toBeNull();
  });

  it("hides upload while session is loading", () => {
    expect(canShowUploadUI(INITIAL_CLIENT_AUTH_STATE)).toBe(false);
    expect(getUploadUIHiddenReason(INITIAL_CLIENT_AUTH_STATE)).toBe("session-loading");
  });

  it("hides upload when client session is unauthenticated", () => {
    const auth = createUnauthenticatedAuthState();
    expect(canShowUploadUI(auth)).toBe(false);
    expect(getUploadUIHiddenReason(auth)).toBe("unauthenticated-client-session");
  });

  it("maps session API JSON into client auth state", () => {
    expect(
      mapSessionResponseToAuthState({
        authenticated: true,
        bypass: true,
        mockDevSession: true,
      })
    ).toEqual(createDevBypassAuthState());
  });

  it("uses a bounded session fetch timeout", () => {
    expect(SESSION_FETCH_TIMEOUT_MS).toBeGreaterThan(0);
    expect(SESSION_FETCH_TIMEOUT_MS).toBeLessThanOrEqual(10000);
  });

  it("logs upload readiness in development", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    process.env.NODE_ENV = "development";

    logUploadUIStatus(createDevBypassAuthState());

    expect(infoSpy).toHaveBeenCalled();
    expect(infoSpy.mock.calls[0]?.[0]).toContain("Upload UI ready");
  });
});
