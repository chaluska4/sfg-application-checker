import { describe, expect, it } from "vitest";
import { createDevBypassAuthState } from "@/lib/client-auth";

describe("useClientAuth dev bypass initial state", () => {
  it("provides an authenticated mock session without loading", () => {
    const auth = createDevBypassAuthState();
    expect(auth.loading).toBe(false);
    expect(auth.authenticated).toBe(true);
    expect(auth.bypass).toBe(true);
    expect(auth.mockDevSession).toBe(true);
  });
});
