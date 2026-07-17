// Reads downloaded Outlook email files and returns their plain-text content
// so it can be fed to the SR email parser:
//   .eml — RFC 822 MIME text, what the NEW Outlook saves/drags. Parsed here
//          with no dependencies (multipart walk + quoted-printable/base64).
//   .msg — OLE compound file, what CLASSIC Outlook saves/drags. Parsed with
//          @kenjiuno/msgreader (dynamically imported so it never loads unless
//          the user actually picks a .msg).

export interface EmailFileContent {
    text: string;      // plain-text body (subject prepended so SR-id detection works)
    subject?: string;
    fileName: string;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const htmlToText = (html: string): string => html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    // Keep hyperlink targets: "<a href=URL>SRLink</a>" -> "URL SRLink". The SR
    // email wraps its links in anchor text, so stripping tags outright would
    // discard the only place the URL exists.
    .replace(/<a\s+[^>]*href\s*=\s*["']?([^"'\s>]+)["']?[^>]*>/gi, ' $1 ')
    .replace(/<(?:br|\/p|\/div|\/tr|\/li|\/h[1-6]|\/table)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\n{3,}/g, '\n\n');

// ---------------------------------------------------------------------------
// .eml (MIME) parsing
// ---------------------------------------------------------------------------

const decodeQuotedPrintable = (input: string, charset: string): string => {
    const withoutSoftBreaks = input.replace(/=\r?\n/g, '');
    const bytes: number[] = [];
    for (let i = 0; i < withoutSoftBreaks.length; i++) {
        const ch = withoutSoftBreaks[i];
        if (ch === '=' && i + 2 < withoutSoftBreaks.length && /^[0-9A-Fa-f]{2}$/.test(withoutSoftBreaks.substr(i + 1, 2))) {
            bytes.push(parseInt(withoutSoftBreaks.substr(i + 1, 2), 16));
            i += 2;
        } else {
            bytes.push(ch.charCodeAt(0) & 0xff);
        }
    }
    return safeDecode(new Uint8Array(bytes), charset);
};

const decodeBase64Text = (input: string, charset: string): string => {
    try {
        const binary = atob(input.replace(/\s+/g, ''));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return safeDecode(bytes, charset);
    } catch {
        return input;
    }
};

const safeDecode = (bytes: Uint8Array, charset: string): string => {
    try {
        return new TextDecoder(charset || 'utf-8').decode(bytes);
    } catch {
        return new TextDecoder('utf-8').decode(bytes);
    }
};

/** Decode RFC 2047 encoded-words in headers: =?utf-8?B?...?= / =?utf-8?Q?...?= */
const decodeHeaderValue = (value: string): string =>
    value.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, charset, enc, data) => {
        if (enc.toUpperCase() === 'B') return decodeBase64Text(data, charset);
        return decodeQuotedPrintable(data.replace(/_/g, ' '), charset);
    });

interface MimePart {
    headers: Record<string, string>;
    body: string;
}

const splitHeadersBody = (raw: string): MimePart => {
    const normalized = raw.replace(/\r\n/g, '\n');
    const splitAt = normalized.indexOf('\n\n');
    const headerBlock = splitAt === -1 ? normalized : normalized.slice(0, splitAt);
    const body = splitAt === -1 ? '' : normalized.slice(splitAt + 2);

    const headers: Record<string, string> = {};
    let currentKey = '';
    headerBlock.split('\n').forEach(line => {
        if (/^\s/.test(line) && currentKey) {
            headers[currentKey] += ' ' + line.trim(); // folded header continuation
        } else {
            const idx = line.indexOf(':');
            if (idx > 0) {
                currentKey = line.slice(0, idx).trim().toLowerCase();
                headers[currentKey] = line.slice(idx + 1).trim();
            }
        }
    });
    return { headers, body };
};

const getBoundary = (contentType: string): string | undefined => {
    const match = contentType.match(/boundary\s*=\s*"?([^";\s]+)"?/i);
    return match ? match[1] : undefined;
};

const getCharset = (contentType: string): string => {
    const match = contentType.match(/charset\s*=\s*"?([^";\s]+)"?/i);
    return match ? match[1] : 'utf-8';
};

const decodePartBody = (part: MimePart): string => {
    const contentType = part.headers['content-type'] || 'text/plain';
    const encoding = (part.headers['content-transfer-encoding'] || '').toLowerCase();
    const charset = getCharset(contentType);
    if (encoding.includes('quoted-printable')) return decodeQuotedPrintable(part.body, charset);
    if (encoding.includes('base64')) return decodeBase64Text(part.body, charset);
    return part.body;
};

/** Walk a MIME tree and return the best text body (text/plain preferred over text/html). */
const extractMimeText = (part: MimePart): { plain?: string; html?: string } => {
    const contentType = (part.headers['content-type'] || 'text/plain').toLowerCase();

    if (contentType.startsWith('multipart/')) {
        const boundary = getBoundary(part.headers['content-type'] || '');
        if (!boundary) return {};
        const found: { plain?: string; html?: string } = {};
        part.body.split(new RegExp('--' + boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:--)?')).forEach(chunk => {
            const trimmed = chunk.trim();
            if (!trimmed) return;
            const sub = extractMimeText(splitHeadersBody(trimmed));
            if (sub.plain && !found.plain) found.plain = sub.plain;
            if (sub.html && !found.html) found.html = sub.html;
        });
        return found;
    }
    if (contentType.startsWith('text/plain')) return { plain: decodePartBody(part) };
    if (contentType.startsWith('text/html')) return { html: decodePartBody(part) };
    return {};
};

const readEml = async (file: File): Promise<EmailFileContent> => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const raw = safeDecode(bytes, 'utf-8');
    const root = splitHeadersBody(raw);
    const subject = root.headers['subject'] ? decodeHeaderValue(root.headers['subject']) : undefined;
    const { plain, html } = extractMimeText(root);
    const text = plain || (html ? htmlToText(html) : '');
    if (!text.trim()) throw new Error('Could not extract a text body from this .eml file.');
    return { text: subject ? `${subject}\n\n${text}` : text, subject, fileName: file.name };
};

// ---------------------------------------------------------------------------
// .msg (Outlook classic, OLE compound file) parsing
// ---------------------------------------------------------------------------

/**
 * Minimal RTF → text converter for Outlook message bodies, including
 * "encapsulated HTML" RTF (\fromhtml1), where the visible text sits between
 * ignorable {\*\htmltag ...} markup groups and RTF-only fragments are wrapped
 * in \htmlrtf ... \htmlrtf0 toggles.
 */
export const rtfToText = (rtf: string): string => {
    const SKIP_DESTS = ['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'themedata', 'generator', 'filetbl', 'listtable', 'listoverridetable'];
    let out = '';
    let i = 0;
    const n = rtf.length;
    let depth = 0;
    let skipDepth = 0;       // depth of the ignorable group we're inside (0 = none)
    let htmlRtfSkip = false; // inside \htmlrtf ... \htmlrtf0 (RTF-only fallback content)
    let ucSkip = 1;          // fallback chars to skip after each \uN (set by \ucN)

    const emitting = () => skipDepth === 0 && !htmlRtfSkip;

    while (i < n) {
        const ch = rtf[i];
        if (ch === '{') {
            depth++;
            i++;
            if (skipDepth === 0 && rtf[i] === '\\') {
                if (rtf[i + 1] === '*') {
                    // Ignorable destination {\* ...} — EXCEPT {\*\htmltag ...}:
                    // in encapsulated-HTML RTF those carry the original markup
                    // (<br>, <p>, ...) which htmlToText later turns into line
                    // breaks; dropping them would glue all fields onto one line.
                    if (!/^\\\*\\htmltag/.test(rtf.slice(i, i + 12))) skipDepth = depth;
                } else {
                    const word = /^[a-z]+/i.exec(rtf.slice(i + 1, i + 24))?.[0]?.toLowerCase();
                    if (word && SKIP_DESTS.includes(word)) skipDepth = depth;
                }
            }
            continue;
        }
        if (ch === '}') {
            if (skipDepth === depth) skipDepth = 0;
            depth--;
            i++;
            continue;
        }
        if (ch === '\\') {
            const next = rtf[i + 1];
            if (next === '\\' || next === '{' || next === '}') {
                if (emitting()) out += next;
                i += 2;
                continue;
            }
            if (next === '*') { i += 2; continue; } // destination marker, no output
            if (next === "'") {
                const code = parseInt(rtf.substr(i + 2, 2), 16);
                if (emitting() && !isNaN(code)) out += String.fromCharCode(code);
                i += 4;
                continue;
            }
            if (next === '~') { if (emitting()) out += ' '; i += 2; continue; }
            const m = /^([a-z]+)(-?\d+)? ?/i.exec(rtf.slice(i + 1));
            if (!m) { i++; continue; }
            const word = m[1].toLowerCase();
            const param = m[2] !== undefined ? parseInt(m[2]) : undefined;
            i += 1 + m[0].length;
            if (skipDepth) continue;
            if (word === 'htmlrtf') { htmlRtfSkip = param !== 0; continue; }
            if (htmlRtfSkip) continue;
            if (word === 'par' || word === 'line' || word === 'row') { out += '\n'; continue; }
            if (word === 'tab' || word === 'cell') { out += '\t'; continue; }
            if (word === 'uc' && param !== undefined) { ucSkip = param; continue; }
            if (word === 'u' && param !== undefined) {
                out += String.fromCharCode(param < 0 ? param + 65536 : param);
                let skip = ucSkip;
                while (skip > 0 && i < n && rtf[i] !== '{' && rtf[i] !== '}') {
                    if (rtf[i] === '\\' && rtf[i + 1] === "'") i += 4;
                    else if (rtf[i] === '\\') { const mm = /^[a-z]+(-?\d+)? ?/i.exec(rtf.slice(i + 1)); i += 1 + (mm ? mm[0].length : 1); }
                    else i++;
                    skip--;
                }
                continue;
            }
            continue; // any other control word produces no text
        }
        if (ch === '\r' || ch === '\n') { i++; continue; }
        if (emitting()) out += ch;
        i++;
    }
    return out;
};

/** Full RTF-body pipeline: de-RTF, then strip markup if it was encapsulated HTML. */
export const rtfBodyToText = (rtf: string): string => {
    const text = rtfToText(rtf);
    return /\\fromhtml/.test(rtf) ? htmlToText(text) : text;
};

const readMsg = async (file: File): Promise<EmailFileContent> => {
    // CJS/ESM interop differs per bundler: the class may land on `default`
    // (rollup/vite build) or `default.default` (esbuild node-mode interop).
    const mod: any = await import('@kenjiuno/msgreader');
    const MsgReader = [mod?.default?.default, mod?.default, mod?.MsgReader, mod]
        .find(candidate => typeof candidate === 'function');
    if (!MsgReader) throw new Error('Could not load the .msg reader library.');
    const data: any = new MsgReader(await file.arrayBuffer()).getFileData();
    if (data?.error) throw new Error(`Could not read .msg file: ${data.error}`);

    const subject: string | undefined = data?.subject || undefined;

    // Body fallback chain — Outlook stores the body in any of these MAPI props
    // depending on version/format: plain text, HTML string, HTML bytes, or
    // (very commonly) ONLY compressed RTF.
    let text: string = (data?.body || '').trim();
    if (!text && typeof data?.bodyHtml === 'string' && data.bodyHtml.trim()) {
        text = htmlToText(data.bodyHtml).trim();
    }
    if (!text && data?.html) {
        const bytes = data.html instanceof Uint8Array ? data.html : new Uint8Array(data.html);
        text = htmlToText(safeDecode(bytes, 'utf-8')).trim();
    }
    if (!text && data?.compressedRtf) {
        const rtfMod: any = await import('@kenjiuno/decompressrtf');
        const decompressRTF = rtfMod?.decompressRTF || rtfMod?.default?.decompressRTF;
        if (decompressRTF) {
            const bytes = data.compressedRtf instanceof Uint8Array ? data.compressedRtf : new Uint8Array(data.compressedRtf);
            const rtf = safeDecode(new Uint8Array(decompressRTF(Array.from(bytes))), 'windows-1252');
            text = rtfBodyToText(rtf).trim();
        }
    }
    if (!text) throw new Error('This .msg file has no readable text body. Try copy-pasting the email instead.');
    return { text: subject ? `${subject}\n\n${text}` : text, subject, fileName: file.name };
};

// ---------------------------------------------------------------------------

export const readEmailFile = async (file: File): Promise<EmailFileContent> => {
    const name = file.name.toLowerCase();
    if (name.endsWith('.msg')) return readMsg(file);
    if (name.endsWith('.eml')) return readEml(file);
    // Unknown extension: try as plain text (covers .txt exports)
    const text = await file.text();
    if (!text.trim()) throw new Error('Unsupported file type. Use a .msg or .eml email file.');
    return { text, fileName: file.name };
};
