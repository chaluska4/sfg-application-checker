import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import {
  isLocalAuthBypassEnabled,
  logLocalAuthBypassWarningOnce,
} from "@/lib/local-auth-bypass";

export async function requireAuthenticatedReviewAccess(): Promise<NextResponse | null> {
  if (isLocalAuthBypassEnabled()) {
    logLocalAuthBypassWarningOnce();
    return null;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
