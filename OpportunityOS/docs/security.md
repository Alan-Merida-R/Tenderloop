# Security notes

## Local-only operation

- The Vite application server binds to `127.0.0.1`; it is not exposed to the LAN.
- The local backend binds to `127.0.0.1` and only accepts browser requests from `http://localhost:3000` or `http://127.0.0.1:3000`.
- The backend rejects requests with a missing or untrusted `Origin` header because its OS routes can open files, copy folders and access local OpportunityOS data.

## Web automation (`/api/web/*`)

These routes drive a real browser that can be signed in to corporate systems, so they carry their own controls. Disable them entirely with `OPPORTUNITYOS_DISABLE_WEB=1`; the health endpoint reports whether they are mounted.

- **Host allow-list.** Only allow-listed hosts are ever navigated to — Salesforce/bFO and Schneider Electric domains by default, extended without a code change through `OPPORTUNITYOS_WEB_HOSTS` (comma-separated). Without this, anything able to reach port 3099 could point the endpoint at an arbitrary URL and drive the user's authenticated session — a confused deputy. Subdomains match (`bfo.salesforce.com`); look-alike suffixes do not (`notsalesforce.com`). Loopback is **not** allow-listed by default, so the endpoint cannot be aimed at other local services unless that is opted into explicitly.
- **HTTPS.** Plain HTTP is accepted only on loopback, where traffic never leaves the machine. Everything reachable over the network must be HTTPS.
- **No credential handling.** The user signs in by hand in a visible window (`POST /login`) and completes SSO/MFA there. OpportunityOS never sees, stores or types a credential.
- **Dedicated profile.** The session lives in a separate Chrome profile under `%APPDATA%\OpportunityOS\chrome-profile`, not the user's normal profile. Chrome refuses remote control of the default profile, and the split keeps a captured corporate session from leaking into — or being clobbered by — day-to-day browsing.
- **Redaction by default.** `POST /probe` returns a redacted result unless the caller opts out. Redacted mode keeps structure — labels, selectors, field types, JSON key paths, URL shape — and drops content: values become `<email>`, `<url>`, `<number>`, `<date>` or `<text N chars>`, and identifiers in URLs become `{id}` / `{guid}`. This makes a probe of a real customer record safe to paste into a ticket or a commit.
- **Artifacts stay local.** Full page HTML, text, screenshots and captured JSON are always written to `%APPDATA%\OpportunityOS\web-probes`. Treat that folder as working data: it contains unredacted customer information and must never be committed or shared.
- **No administrator rights.** The engine uses the Chrome or Edge already installed on the machine and downloads no browser of its own.

## Content safety

HTML from imported emails, notes and email-template previews is sanitized before it is rendered. Do not bypass `sanitizeHtml()` when adding a new `innerHTML` or `dangerouslySetInnerHTML` rendering path.

## Dependency policy

The Windows installer uses `npm ci --include=dev`, which installs the exact dependency graph in `package-lock.json`.

`npm audit --omit=dev` has one remaining advisory for `xlsx` 0.18.5. OpportunityOS uses that library only to **write** the user-requested task-export workbook; it does not parse user-supplied XLSX files. The advisory has no fixed npm release. Replacing this export with a maintained writer is planned before any future feature that imports or parses Excel files.

Web automation uses `playwright-core`, not the full `playwright` package: `-core` ships the automation client without bundling browser binaries, so installing it downloads no browser and needs no administrator rights. The engine drives the Chrome or Edge already present on the machine.

## Limits

This is a local desktop-style application, not a multi-user hosted service. A program already running with the same Windows user privileges can access that user's files; the loopback/origin controls protect against network exposure and hostile websites, not against a compromised Windows account.
