import { NextRequest, NextResponse } from "next/server";
import {
  COOKIE_NAME,
  createSessionToken,
  getClientIp,
  getSessionCookieOptions,
} from "@/lib/auth";
import { isAuthConfigured, verifyPassword } from "@/lib/auth-password";
import {
  checkLoginRateLimit,
  clearLoginRateLimit,
  recordFailedLogin,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isAuthConfigured()) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  const ip = getClientIp(request);
  const { allowed } = checkLoginRateLimit(ip);

  if (!allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429 }
    );
  }

  try {
    const body = (await request.json()) as { password?: unknown };
    const password = typeof body.password === "string" ? body.password : "";

    if (!password || !verifyPassword(password)) {
      recordFailedLogin(ip);
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    }

    const token = await createSessionToken();
    if (!token) {
      return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
    }

    clearLoginRateLimit(ip);

    const response = NextResponse.json({ ok: true });
    response.cookies.set(COOKIE_NAME, token, getSessionCookieOptions());
    return response;
  } catch {
    recordFailedLogin(ip);
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }
}
