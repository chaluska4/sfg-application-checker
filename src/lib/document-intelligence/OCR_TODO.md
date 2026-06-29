# OCR Integration — Future Enhancement

V2 uses **embedded PDF text only**. Scanned/image-only pages are marked **Needs Manual Verification**, not Missing.

## Recommended OCR providers

| Provider | Use case |
|----------|----------|
| **Azure Document Intelligence** | Forms, checkboxes, tables, handwriting |
| **Google Document AI** | Structured form parsing |
| **AWS Textract** | Key-value pairs, signatures |
| **OpenAI Vision** | Ad-hoc layout + handwriting (higher cost) |

## Integration approach

1. In `extract-pdf-text.ts`, when `hasEmbeddedText === false` for a page, call OCR API with page raster (via `unpdf` `renderPageAsImage`).
2. Merge OCR text into `PageAnalysis.rawText` with `confidence: "low"|"medium"`.
3. Pass OCR checkbox/signature entities into `detect-checkboxes.ts` / `detect-signatures.ts`.
4. Store API keys in Vercel env vars (`AZURE_DI_ENDPOINT`, `AZURE_DI_KEY`, etc.).
5. Add per-page timeout and size limits for serverless (max 25 MB PDF, process pages in batches).

## Do not

- Mark fields **Missing** solely because OCR was not run.
- Return raw SSN/DOB from OCR output to the client.
