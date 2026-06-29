# Security & Reliability Review — SFG Form Completeness Checker

**Review date:** June 29, 2026  
**Scope:** Full Next.js codebase (27 source files)  
**Stack:** Next.js 15 App Router, TypeScript, `pdf-lib`, Vercel serverless

---

## 1. Current Security Posture

### Architecture summary

| Area | Current state |
|------|----------------|
| **Upload flow** | Browser → `POST /api/review` (FormData) → in-memory `ArrayBuffer` → `pdf-lib` field extraction → validation engine → JSON response |
| **File storage** | **None.** PDFs are never written to disk, database, blob storage, or cache. Processing is ephemeral in the serverless function memory. |
| **Client vs server** | PDF parsing and validation run **entirely server-side**. The client only uploads the file and renders checklist results. |
| **PII in responses** | Extracted field **values** (names, SSNs, addresses, etc.) are used server-side only. The API returns rule labels, statuses, and messages — not raw PDF field values. |
| **Authentication** | **None.** The upload API is publicly callable by anyone who can reach the deployment URL. |
| **Secrets** | No API keys, tokens, or credentials in source. `.env*` is gitignored. No `process.env` usage in application code. |
| **XSS surface** | React JSX text rendering throughout. No `dangerouslySetInnerHTML`, `eval`, or `innerHTML` in app code. |
| **Logging** | One server log on processing failure (message only, after this review's fixes). No client-side logging of uploads or results. |
| **Dependencies** | Small footprint: `next`, `react`, `pdf-lib`, `lucide-react`. `npm audit` reports one moderate transitive PostCSS advisory via Next.js (build-time CSS tooling, not runtime upload path). |

### Positive controls already in place

- 4 MB upload size cap aligned with Vercel Hobby body limits (`src/lib/upload-security.ts`, `src/app/api/review/route.ts`)
- Server-side-only PDF handling
- Generic 500 error messages to clients (no stack traces in API responses)
- `private: true` in `package.json`
- TypeScript strict mode via `tsconfig.json`
- Deterministic validation schema (`src/lib/validation/schema.ts`) and pure validation engine (`src/lib/validation/engine.ts`)

### Fixes applied in this review (high-priority, behavior-neutral)

- PDF magic-byte validation (`%PDF-` header) before parsing
- Upload filename sanitization (path stripping, control-character removal, length cap)
- Safe server error logging (message string only, no full error object / stack dump)
- HTTP security headers (CSP, `X-Frame-Options`, `nosniff`, etc.) via `next.config.ts`
- Removed unused `serverActions.bodySizeLimit: "10mb"` that conflicted with the 4 MB API limit

---

## 2. Risks Found

### R1 — No authentication or access control on upload endpoint

| | |
|---|---|
| **Severity** | **High** |
| **Files** | `src/app/api/review/route.ts` (lines 13–54), `src/app/page.tsx` (lines 22–25) |
| **Description** | Any anonymous user who discovers the Vercel URL can upload annuity application PDFs containing PII. There is no SSO, API key, Vercel Deployment Protection, or IP allowlist. |
| **Recommended fix** | Before production use: enable **Vercel Deployment Protection** (password or SSO), place the app behind a corporate VPN/reverse proxy, or add application-level auth middleware. Document that this is an internal-only tool. |
| **Before SFG relies on tool?** | **Yes — required** |

---

### R2 — No rate limiting or abuse protection

| | |
|---|---|
| **Severity** | **High** |
| **Files** | `src/app/api/review/route.ts` (entire handler); no `middleware.ts` exists |
| **Description** | An attacker can flood `/api/review` with uploads, causing CPU/memory pressure on serverless functions and increased Vercel billing. Each request loads a full PDF into memory and runs `pdf-lib`. |
| **Recommended fix** | Add Vercel WAF/rate limiting, Upstash Redis rate limiter in middleware, or restrict access at the network edge (see R1). Set conservative `maxDuration` (already 30s). |
| **Before SFG relies on tool?** | **Yes — required** for any public URL |

---

### R3 — PDF parser resource exhaustion (DoS)

| | |
|---|---|
| **Severity** | **Medium** |
| **Files** | `src/lib/pdf/extract-fields.ts` (line 11: `PDFDocument.load`), `src/app/api/review/route.ts` (lines 33–42) |
| **Description** | `pdf-lib` parses the entire PDF in memory. A malformed or crafted PDF within the 4 MB cap can still cause high CPU usage or slow requests. No page-count or field-count limits. |
| **Recommended fix** | Add request timeouts (partially covered by `maxDuration`), monitor function duration in Vercel, consider a dedicated parsing sandbox for untrusted input. Optionally reject PDFs exceeding N pages after a lightweight header scan. |
| **Before SFG relies on tool?** | **Recommended** (monitoring at minimum) |

---

### R4 — MIME type / extension-only validation (partially mitigated)

| | |
|---|---|
| **Severity** | **Medium** (was High before magic-byte check) |
| **Files** | `src/app/api/review/route.ts` (lines 22–24, 35–39), `src/components/UploadCard.tsx` (lines 23–24, 94) |
| **Description** | Client and server previously accepted files based only on `file.type` and `.pdf` extension, which are trivially spoofed. **Mitigated:** server now validates `%PDF-` magic bytes (`src/lib/upload-security.ts` lines 7–11). Extension/MIME checks remain as a first-pass filter only. |
| **Recommended fix** | Keep magic-byte validation. Optionally add a maximum PDF version / object count check. Mirror the 4 MB limit on the client in `UploadCard` for faster feedback. |
| **Before SFG relies on tool?** | Magic-byte check **done**. Client size mirror is optional. |

---

### R5 — `ignoreEncryption: true` on PDF load

| | |
|---|---|
| **Severity** | **Medium** |
| **Files** | `src/lib/pdf/extract-fields.ts` (line 11) |
| **Description** | Encrypted PDFs are loaded without a password. Fields may be unreadable or extraction may behave unexpectedly. This is a reliability concern more than a direct exploit, but it weakens assurance that extracted data reflects the intended document. |
| **Recommended fix** | Document expected behavior for encrypted PDFs. If password-protected applications are in scope, require decryption before upload or return a clear “encrypted PDF” error instead of silent partial extraction. |
| **Before SFG relies on tool?** | **Recommended** (document policy) |

---

### R6 — Sensitive data in server logs (partially mitigated)

| | |
|---|---|
| **Severity** | **Medium** (was Medium–High before fix) |
| **Files** | `src/app/api/review/route.ts` (lines 47–48) |
| **Description** | Previously `console.error("Review error:", error)` could log full stack traces and parser internals to Vercel logs, which may indirectly reference uploaded content metadata. **Mitigated:** now logs only `error.message`. |
| **Recommended fix** | Avoid logging filenames or field names in production. Use structured logging with redaction if observability is needed. |
| **Before SFG relies on tool?** | **Done** for obvious case; audit any future logging |

---

### R7 — User-controlled filename reflected in API response and UI

| | |
|---|---|
| **Severity** | **Low** (XSS mitigated by React; log injection reduced) |
| **Files** | `src/app/api/review/route.ts` (line 43), `src/components/ResultsDashboard.tsx` (line 36), `src/components/UploadCard.tsx` (line 84) |
| **Description** | Upload filename is echoed in JSON and displayed in the UI. React auto-escapes text nodes, so XSS risk is low. Malicious filenames (`../../secret.pdf`, control characters) could confuse users or appear in logs. **Mitigated:** server sanitizes via `sanitizeFileName()` (`src/lib/upload-security.ts` lines 14–17). |
| **Recommended fix** | Sanitize on server **done**. Optionally sanitize display on client for defense in depth. |
| **Before SFG relies on tool?** | **Done** on server |

---

### R8 — Missing HTTP security headers (mitigated)

| | |
|---|---|
| **Severity** | **Medium** (was Medium before fix) |
| **Files** | `next.config.ts` (lines 3–35) |
| **Description** | No CSP, frame denial, or MIME-sniff protection was configured. **Mitigated:** security headers added for all routes. |
| **Recommended fix** | Review CSP if third-party scripts are added later. Consider `Strict-Transport-Security` at the Vercel/CDN layer. |
| **Before SFG relies on tool?** | **Done** for baseline headers |

---

### R9 — Transitive dependency advisory (PostCSS via Next.js)

| | |
|---|---|
| **Severity** | **Low** |
| **Files** | `package.json`, `package-lock.json` (`next` → `postcss`) |
| **Description** | `npm audit` reports GHSA-qx2v-qp2m-jg93 (PostCSS XSS in CSS stringify, moderate). This affects build-time CSS processing, not the PDF upload API runtime. Risk to end users of the deployed app is minimal given no user-supplied CSS is processed at runtime. |
| **Recommended fix** | Keep Next.js updated; re-run `npm audit` on each release. |
| **Before SFG relies on tool?** | Monitor; not blocking for internal demo |

---

### R10 — Fuzzy AcroForm field matching (reliability)

| | |
|---|---|
| **Severity** | **Low** (reliability, not direct security) |
| **Files** | `src/lib/validation/engine.ts` (lines 24–38, especially line 33: `pattern.includes(normalized)`) |
| **Description** | Bidirectional substring matching can associate the wrong PDF field with a validation rule (e.g. a field named `ssn` matching multiple rules). Results may be inconsistent or incorrect across similar forms. |
| **Recommended fix** | Prefer exact or prefix-only matching per rule; add golden-file tests with real EquiTrust PDFs. |
| **Before SFG relies on tool?** | **Yes — required** for accuracy trust, not for security per se |

---

### R11 — Validation repeatability

| | |
|---|---|
| **Severity** | **Low** |
| **Files** | `src/lib/validation/engine.ts`, `src/lib/validation/schema.ts`, `src/lib/pdf/extract-fields.ts` |
| **Description** | Given the same PDF bytes and schema version, validation is deterministic: fixed rule order, stable grouping sorts, no randomness or timestamps in output. Field iteration order from `pdf-lib` `getFields()` is stable for a given file. Score and status derive solely from rule outcomes. |
| **Caveats** | Different `pdf-lib` versions, encrypted PDFs, or forms with renamed fields may change results. No schema version is exposed in API responses. |
| **Recommended fix** | Expose `schemaVersion` in `ReviewResult`; pin `pdf-lib` version; add regression tests with fixture PDFs. |
| **Before SFG relies on tool?** | **Recommended** |

---

### R12 — No CSRF token on upload

| | |
|---|---|
| **Severity** | **Low** |
| **Files** | `src/app/page.tsx` (lines 19–25) |
| **Description** | Upload uses `fetch` POST without CSRF token. No session cookies or auth cookies are used, so classic CSRF impact is limited (attacker could trick a user into uploading a PDF they choose, but no authenticated action is performed). |
| **Recommended fix** | If auth cookies are added later, implement CSRF protection or SameSite cookie policy. |
| **Before SFG relies on tool?** | No (unless auth is added) |

---

### R13 — Client-side upload validation is weaker than server

| | |
|---|---|
| **Severity** | **Low** |
| **Files** | `src/components/UploadCard.tsx` (lines 22–26, 91–96) |
| **Description** | Client accepts PDF by extension/MIME only; no size check before upload. Server enforces all real limits. |
| **Recommended fix** | Add client-side 4 MB check and magic-byte read (optional UX improvement). |
| **Before SFG relies on tool?** | Optional |

---

### R14 — Vercel deployment exposure

| | |
|---|---|
| **Severity** | **High** (operational) |
| **Files** | Deployment configuration (no `vercel.json` in repo) |
| **Description** | Default Vercel deployment is internet-facing. Financial application PDFs transit through Vercel's serverless infrastructure. Data processing agreement and internal policy must cover this. |
| **Recommended fix** | Use Vercel Pro Deployment Protection, private networking, or self-host if policy requires data not leave SFG-controlled infrastructure. Add privacy notice in UI stating files are processed in memory and not stored. |
| **Before SFG relies on tool?** | **Yes — required** (legal + access control) |

---

### R15 — TypeScript / API response trust

| | |
|---|---|
| **Severity** | **Low** |
| **Files** | `src/app/page.tsx` (line 33: `setResult(data)`), `src/lib/validation/types.ts` |
| **Description** | Client trusts API JSON shape without runtime validation (no Zod/io-ts). Malicious proxy could inject unexpected data; React would still escape strings. `groupedItems` is returned but unused by UI (minor payload bloat). |
| **Recommended fix** | Validate API response with a schema parser if threat model includes MITM. Remove unused `groupedItems` from response to reduce payload. |
| **Before SFG relies on tool?** | Optional |

---

## 3. Severity Summary

| Severity | Count | IDs |
|----------|-------|-----|
| **High** | 3 | R1, R2, R14 |
| **Medium** | 4 | R3, R4, R5, R6 (R4/R6/R8 partially fixed) |
| **Low** | 8 | R7, R9, R10, R11, R12, R13, R15 (+ R7/R8 mitigated) |

---

## 4. Recommended Fixes — Priority for SFG Production Use

### Must complete before SFG relies on this tool

1. **Access control** — Vercel Deployment Protection, SSO, VPN, or equivalent (R1, R14)
2. **Rate limiting / abuse protection** (R2)
3. **Legal/compliance review** — PII flows through Vercel serverless; confirm acceptable (R14)
4. **Accuracy validation** — Test against real EquiTrust PDFs; tighten field matching (R10)
5. **Operational monitoring** — Function errors, duration, upload volume (R3)

### Already addressed in this review

- PDF magic-byte validation (R4)
- Filename sanitization (R7)
- Safe error logging (R6)
- HTTP security headers (R8)
- Removed misleading 10 MB serverActions limit

### Should do soon (not blocking internal demo)

- Document encrypted PDF behavior (R5)
- Schema version in API responses + fixture tests (R11)
- Keep dependencies updated (R9)
- Client-side size validation for UX (R13)

### Not required for current threat model

- CSRF tokens (R12) — until session auth exists
- Runtime API response validation (R15) — unless MITM is in scope

---

## 5. File Reference Index

| File | Security relevance |
|------|-------------------|
| `src/app/api/review/route.ts` | Upload handler, size/type checks, PDF processing entry point |
| `src/lib/upload-security.ts` | Magic-byte validation, filename sanitization, size constant |
| `src/lib/pdf/extract-fields.ts` | `pdf-lib` parsing, encryption bypass |
| `src/lib/validation/engine.ts` | Validation logic, field matching, no PII in output items |
| `src/lib/validation/schema.ts` | Static rules (SSN, signatures, etc.) |
| `src/lib/validation/types.ts` | Response shapes — no raw field values in `ChecklistItem` |
| `src/app/page.tsx` | Client upload orchestration |
| `src/components/UploadCard.tsx` | Client file picker |
| `src/components/ResultsDashboard.tsx` | Displays `fileName`, checklist (labels/messages only) |
| `src/components/ChecklistGroup.tsx` | Renders checklist — React-escaped text |
| `next.config.ts` | Security headers |
| `.gitignore` | Excludes `.env*` |
| `package.json` | Dependency versions |

---

## 6. Conclusion

This application has a **sound baseline for an internal demo**: server-side processing, no persistent storage of uploads, no secrets in code, no raw PII in API responses, and React-safe rendering. The **primary gaps for production use are operational**: the tool is **publicly uploadable without authentication**, has **no rate limiting**, and processes **regulated financial PII** through a third-party serverless host.

The code changes from this review harden input validation, logging, and HTTP headers without altering validation logic or user-facing behavior for legitimate PDF uploads.
