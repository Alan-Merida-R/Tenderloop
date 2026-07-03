import { execFile } from 'node:child_process';

/**
 * Run a PowerShell command and resolve with its stdout (trimmed).
 * `timeoutMs` kills the process if it runs too long (e.g. a slow disk search).
 * On timeout, partial stdout (if any) is still returned.
 */
export const runPowerShell = (script: string, timeoutMs = 0, extraArgs: string[] = []): Promise<string> =>
    new Promise((resolve, reject) => {
        execFile(
            'powershell.exe',
            ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', ...extraArgs, '-Command', script],
            { windowsHide: true, maxBuffer: 1024 * 1024 * 8, timeout: timeoutMs, killSignal: 'SIGKILL' },
            (err, stdout) => {
                const out = (stdout || '').trim();
                if (err && !out) reject(err); else resolve(out);
            }
        );
    });

/** Escape a JS string so it can sit inside a PowerShell single-quoted literal. */
export const psSingleQuote = (s: unknown): string => `'${String(s).replace(/'/g, "''")}'`;
