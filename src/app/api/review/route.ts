import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { runDocumentIntelligence } from "@/lib/document-intelligence";
import { resolveOcrProvider } from "@/lib/document-intelligence/ocr/resolve-ocr-provider";
import {
  isPdfBuffer,
  isPdfWithinSizeLimit,
  MAX_PDF_SIZE_ERROR,
  sanitizeFileName,
} from "@/lib/upload-security";
import { COOKIE_NAME, verifySessionToken } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No PDF file provided." }, { status: 400 });
    }

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "File must be a PDF." }, { status: 400 });
    }

    if (!isPdfWithinSizeLimit(file.size)) {
      return NextResponse.json({ error: MAX_PDF_SIZE_ERROR }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();

    if (!isPdfBuffer(arrayBuffer)) {
      return NextResponse.json(
        { error: "File must be a valid PDF." },
        { status: 400 }
      );
    }

    const ocrProvider = resolveOcrProvider();
    const result = await runDocumentIntelligence(
      arrayBuffer,
      sanitizeFileName(file.name),
      undefined,
      { ocrProvider }
    );

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Review processing failed:", message);
    return NextResponse.json(
      { error: "Failed to process PDF. Please ensure the file is a valid PDF." },
      { status: 500 }
    );
  }
}
