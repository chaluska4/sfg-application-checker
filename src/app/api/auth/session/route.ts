import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { isLocalAuthBypassEnabled } from "@/lib/local-auth-bypass";
import type { ClientSessionResponse } from "@/lib/client-auth";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse<ClientSessionResponse>> {
  if (isLocalAuthBypassEnabled()) {
    return NextResponse.json({
      authenticated: true,
      bypass: true,
      mockDevSession: true,
    });
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const authenticated = token ? await verifySessionToken(token) : false;

  return NextResponse.json({
    authenticated,
    bypass: false,
    mockDevSession: false,
  });
}
