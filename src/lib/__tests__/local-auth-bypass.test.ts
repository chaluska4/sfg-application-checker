import { describe, expect, it, afterEach, vi } from "vitest";
import {
  isLocalAuthBypassEnabled,
  logLocalAuthBypassWarningOnce,
  resetLocalAuthBypassWarningForTests,
} from "@/lib/local-auth-bypass";

describe("local auth bypass", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalBypass = process.env.LOCAL_AUTH_BYPASS;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalBypass === undefined) {
      delete process.env.LOCAL_AUTH_BYPASS;
    } else {
      process.env.LOCAL_AUTH_BYPASS = originalBypass;
    }
    resetLocalAuthBypassWarningForTests();
  });

  it("is disabled in production even when LOCAL_AUTH_BYPASS=true", () => {
    process.env.NODE_ENV = "production";
    process.env["LOCAL_AUTH_BYPASS"] = "true";
    expect(isLocalAuthBypassEnabled()).toBe(false);
  });

  it("is disabled in development when LOCAL_AUTH_BYPASS is not true", () => {
    process.env.NODE_ENV = "development";
    process.env["LOCAL_AUTH_BYPASS"] = "false";
    expect(isLocalAuthBypassEnabled()).toBe(false);
  });

  it("is enabled only in development when LOCAL_AUTH_BYPASS=true", () => {
    process.env.NODE_ENV = "development";
    process.env["LOCAL_AUTH_BYPASS"] = "true";
    expect(isLocalAuthBypassEnabled()).toBe(true);
  });

  it("logs a development warning once when bypass is enabled", () => {
    process.env.NODE_ENV = "development";
    process.env["LOCAL_AUTH_BYPASS"] = "true";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    logLocalAuthBypassWarningOnce();
    logLocalAuthBypassWarningOnce();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain("LOCAL_AUTH_BYPASS");

    warnSpy.mockRestore();
  });
});
