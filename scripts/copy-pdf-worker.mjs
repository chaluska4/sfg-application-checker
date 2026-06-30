import { copyFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs");
const publicDir = join(root, "public");
const destination = join(publicDir, "pdf.worker.min.mjs");

if (!existsSync(source)) {
  console.warn("[copy-pdf-worker] pdfjs-dist worker not found — run npm install first.");
  process.exit(0);
}

mkdirSync(publicDir, { recursive: true });
copyFileSync(source, destination);
console.log("[copy-pdf-worker] Copied pdf.worker.min.mjs to public/");
