import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/auth/session/route";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
  })),
}));

vi.mock("@/lib/auth", () => ({
  COOKIE_NAME: "sfg_app_session",
  verifySessionToken: vi.fn(async () => false),
}));

describe("GET /api/auth/session", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalBypass = process.env.LOCAL_AUTH_BYPASS;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalBypass === undefined) {
      delete process.env.LOCAL_AUTH_BYPASS;
    } else {
      process.env.LOCAL_AUTH_BYPASS = originalBypass;
    }
  });

  it("returns mock authenticated session when LOCAL_AUTH_BYPASS is enabled in development", async () => {
    process.env.NODE_ENV = "development";
    process.env["LOCAL_AUTH_BYPASS"] = "true";

    const response = await GET();
    const body = await response.json();

    expect(body).toEqual({
      authenticated: true,
      bypass: true,
      mockDevSession: true,
    });
  });

  it("does not bypass in production", async () => {
    process.env.NODE_ENV = "production";
    process.env["LOCAL_AUTH_BYPASS"] = "true";

    const response = await GET();
    const body = await response.json();

    expect(body.authenticated).toBe(false);
    expect(body.bypass).toBe(false);
    expect(body.mockDevSession).toBe(false);
  });
});
