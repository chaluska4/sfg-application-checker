import { NextResponse } from "next/server";
import { COOKIE_NAME, getExpiredSessionCookieOptions } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, "", getExpiredSessionCookieOptions());
  return response;
}
