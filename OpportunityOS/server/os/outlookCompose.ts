// Opens an email DRAFT in Outlook — never sends.
// Two strategies:
//  - COM automation (classic Outlook only): full fidelity, reliable BCC.
//  - .eml file with "X-Unsent: 1" (classic AND new Outlook/olk.exe): opened via the OS
//    file association, so it lands in whichever Outlook the user runs.
// 'auto' detects which Outlook the user is actually using RIGHT NOW and picks accordingly.
// Note: the "Try the new Outlook" toggle inside Microsoft 365's classic Outlook keeps the
// classic OUTLOOK.EXE process (and its registry/App Paths entry) around even while the user
// is really working in the new UI, hosted by a separate `olk.exe` process — both can be
// running at once. So detection checks RUNNING processes first (olk.exe wins if present,
// since that's what the user is actually looking at), and only falls back to the classic
// App Paths registry key when neither is running. This gives classic-Outlook users full COM
// functionality automatically, while never risking COM's known failure mode on the new
// Outlook: it can "succeed" while actually opening an unauthenticated/sign-in-prompting
// session (no classic MAPI profile exists for it to attach to).

import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runPowerShell, psSingleQuote } from './powershell';
import { openNative } from './shell';

export interface ComposeEmailPayload {
    to: string[];
    cc: string[];
    bcc: string[];
    subject: string;
    htmlBody: string;
    /** Absolute paths of files to attach. Validated by the route before calling. */
    attachments: string[];
}

export type ComposeMode = 'auto' | 'com' | 'eml';
export type ComposeResult = { openedWith: 'com' | 'eml' };

const COM_OK_MARKER = 'TL_COMPOSE_OK';

/**
 * Which Outlook the user is actually using right now: checks running processes first
 * (olk.exe = new Outlook UI is what's on screen, wins even if classic OUTLOOK.EXE also
 * lingers in the background), then falls back to the classic App Paths registry key
 * (present only for classic desktop Outlook installs) when neither process is running.
 * Re-checked on every 'auto' send — cheap, and the user can switch Outlook versions
 * or close/reopen it between emails.
 */
const detectOutlookAutoMode = async (): Promise<'com' | 'eml'> => {
    try {
        const script = [
            `if (Get-Process -Name 'olk' -ErrorAction SilentlyContinue) { Write-Output 'EML'; exit }`,
            `if (Get-Process -Name 'OUTLOOK' -ErrorAction SilentlyContinue) { Write-Output 'COM'; exit }`,
            `$paths = @(`,
            `'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\OUTLOOK.EXE',`,
            `'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\OUTLOOK.EXE'`,
            `); foreach ($p in $paths) { if (Test-Path $p) { Write-Output 'COM'; exit } }`,
            `Write-Output 'EML'`,
        ].join(' ');
        const out = await runPowerShell(script, 8000);
        return out.includes('COM') ? 'com' : 'eml';
    } catch {
        return 'eml';
    }
};

const composeViaCom = async (payload: ComposeEmailPayload): Promise<void> => {
    const htmlB64 = Buffer.from(payload.htmlBody, 'utf8').toString('base64');
    const lines = [
        `$ol = New-Object -ComObject Outlook.Application`,
        `$m = $ol.CreateItem(0)`,
        `$m.To = ${psSingleQuote(payload.to.join('; '))}`,
        `$m.CC = ${psSingleQuote(payload.cc.join('; '))}`,
        `$m.BCC = ${psSingleQuote(payload.bcc.join('; '))}`,
        `$m.Subject = ${psSingleQuote(payload.subject)}`,
        // Display first so Outlook materializes the configured default signature.
        `$m.Display()`,
        // Preserve Outlook's default signature and place the generated content above it.
        `$body = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String(${psSingleQuote(htmlB64)}))`,
        `$m.HTMLBody = $body + $m.HTMLBody`,
        ...payload.attachments.map(p => `$null = $m.Attachments.Add(${psSingleQuote(p)})`),
        `Write-Output '${COM_OK_MARKER}'`,
    ];
    const out = await runPowerShell(lines.join('; '), 45000);
    if (!out.includes(COM_OK_MARKER)) {
        throw new Error(`Outlook COM did not confirm: ${out || '(no output)'}`);
    }
};

const wrap76 = (b64: string): string => b64.replace(/(.{76})/g, '$1\r\n');

const encodeHeaderUtf8 = (value: string): string =>
    /^[\x20-\x7e]*$/.test(value)
        ? value
        : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;

const MIME_TYPES: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.zip': 'application/zip',
    '.msg': 'application/vnd.ms-outlook',
    '.eml': 'message/rfc822',
};

export const buildEmlContent = async (payload: ComposeEmailPayload): Promise<string> => {
    const boundary = `----TenderLoop_${Date.now().toString(36)}`;
    const headers: string[] = [
        'X-Unsent: 1',
        `To: ${payload.to.join(', ')}`,
    ];
    if (payload.cc.length) headers.push(`Cc: ${payload.cc.join(', ')}`);
    if (payload.bcc.length) headers.push(`Bcc: ${payload.bcc.join(', ')}`);
    headers.push(
        `Subject: ${encodeHeaderUtf8(payload.subject)}`,
        'MIME-Version: 1.0',
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
    );

    const parts: string[] = [];
    parts.push([
        `--${boundary}`,
        'Content-Type: text/html; charset="utf-8"',
        'Content-Transfer-Encoding: base64',
        '',
        wrap76(Buffer.from(payload.htmlBody, 'utf8').toString('base64')),
    ].join('\r\n'));

    for (const filePath of payload.attachments) {
        const data = await readFile(filePath);
        const name = path.basename(filePath);
        const mime = MIME_TYPES[path.extname(name).toLowerCase()] || 'application/octet-stream';
        parts.push([
            `--${boundary}`,
            `Content-Type: ${mime}; name="${encodeHeaderUtf8(name)}"`,
            'Content-Transfer-Encoding: base64',
            `Content-Disposition: attachment; filename="${encodeHeaderUtf8(name)}"`,
            '',
            wrap76(data.toString('base64')),
        ].join('\r\n'));
    }

    return `${headers.join('\r\n')}\r\n\r\n${parts.join('\r\n')}\r\n--${boundary}--\r\n`;
};

const composeViaEml = async (payload: ComposeEmailPayload): Promise<void> => {
    const dir = path.join(os.tmpdir(), 'tenderloop-emails');
    await mkdir(dir, { recursive: true });
    const safeName = (payload.subject || 'draft').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
    const file = path.join(dir, `${safeName}_${Date.now()}.eml`);
    await writeFile(file, await buildEmlContent(payload), 'utf8');
    await openNative(file);
};

export const composeEmail = async (payload: ComposeEmailPayload, mode: ComposeMode = 'auto'): Promise<ComposeResult> => {
    if (mode === 'com') {
        await composeViaCom(payload);
        return { openedWith: 'com' };
    }
    if (mode === 'eml') {
        await composeViaEml(payload);
        return { openedWith: 'eml' };
    }
    // auto: use COM (full functionality, reliable BCC) only when classic Outlook is what's
    // actually active; use .eml for the new Outlook or when nothing is detected. If COM
    // unexpectedly throws even when classic Outlook is active, fall back to .eml.
    if (await detectOutlookAutoMode() === 'com') {
        try {
            await composeViaCom(payload);
            return { openedWith: 'com' };
        } catch {
            await composeViaEml(payload);
            return { openedWith: 'eml' };
        }
    }
    await composeViaEml(payload);
    return { openedWith: 'eml' };
};

/** Validate attachment paths; returns the ones that do not exist. */
export const findMissingAttachments = (paths: string[]): string[] =>
    paths.map(p => path.normalize(p)).filter(p => !existsSync(p));
