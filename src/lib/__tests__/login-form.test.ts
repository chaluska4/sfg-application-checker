import { describe, expect, it } from "vitest";
import { isSignInButtonDisabled } from "@/app/login/login-form-utils";

describe("login form submit button", () => {
  it("enables in development when password has non-whitespace characters", () => {
    expect(isSignInButtonDisabled("local-dev-password", false, true)).toBe(false);
    expect(isSignInButtonDisabled(" x ", false, true)).toBe(false);
  });

  it("stays disabled in development for empty or whitespace-only passwords", () => {
    expect(isSignInButtonDisabled("", false, true)).toBe(true);
    expect(isSignInButtonDisabled("   ", false, true)).toBe(true);
  });

  it("keeps production rule requiring a non-empty password string", () => {
    expect(isSignInButtonDisabled("secret", false, false)).toBe(false);
    expect(isSignInButtonDisabled("", false, false)).toBe(true);
    expect(isSignInButtonDisabled("   ", false, false)).toBe(false);
  });

  it("disables while loading in all environments", () => {
    expect(isSignInButtonDisabled("secret", true, true)).toBe(true);
    expect(isSignInButtonDisabled("secret", true, false)).toBe(true);
  });
});
