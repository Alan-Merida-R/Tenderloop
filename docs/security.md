# Security notes

## Local-only operation

- The Vite application server binds to `127.0.0.1`; it is not exposed to the LAN.
- The local backend binds to `127.0.0.1` and only accepts browser requests from `http://localhost:3000` or `http://127.0.0.1:3000`.
- The backend rejects requests with a missing or untrusted `Origin` header because its OS routes can open files, copy folders and access local TenderLoop data.

## Content safety

HTML from imported emails, notes and email-template previews is sanitized before it is rendered. Do not bypass `sanitizeHtml()` when adding a new `innerHTML` or `dangerouslySetInnerHTML` rendering path.

## Dependency policy

The Windows installer uses `npm ci --include=dev`, which installs the exact dependency graph in `package-lock.json`.

`npm audit --omit=dev` has one remaining advisory for `xlsx` 0.18.5. TenderLoop uses that library only to **write** the user-requested task-export workbook; it does not parse user-supplied XLSX files. The advisory has no fixed npm release. Replacing this export with a maintained writer is planned before any future feature that imports or parses Excel files.

## Limits

This is a local desktop-style application, not a multi-user hosted service. A program already running with the same Windows user privileges can access that user's files; the loopback/origin controls protect against network exposure and hostile websites, not against a compromised Windows account.
