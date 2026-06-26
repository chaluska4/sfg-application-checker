import { NextRequest, NextResponse } from "next/server";
import { extractPdfFields } from "@/lib/pdf/extract-fields";
import { runValidation } from "@/lib/validation/engine";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Vercel serverless body limit is 4.5 MB on Hobby; keep within safe margin */
const MAX_FILE_SIZE = 4 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No PDF file provided." }, { status: 400 });
    }

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "File must be a PDF." }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File size must not exceed 4 MB." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const { fields, hasFillableFields } = await extractPdfFields(arrayBuffer);
    const result = runValidation(fields, hasFillableFields, file.name);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Review error:", error);
    return NextResponse.json(
      { error: "Failed to process PDF. Please ensure the file is a valid PDF." },
      { status: 500 }
    );
  }
}
