import { NextResponse } from "next/server";
import { MAX_PDF_SIZE_ERROR } from "@/lib/upload-security";

export function createReviewPayloadTooLargeResponse(): NextResponse<{ error: string }> {
  return NextResponse.json({ error: MAX_PDF_SIZE_ERROR }, { status: 413 });
}
