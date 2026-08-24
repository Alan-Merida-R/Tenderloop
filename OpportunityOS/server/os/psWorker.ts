// A single long-lived PowerShell process reused by every OS integration.
//
// WHY: `powershell.exe` costs 400-900 ms just to start (profile-less runs still
// have to JIT the engine). Every "open this folder", "copy these files" and
// "where does this folder live" action paid that toll, which is what made the
// Folder tab feel sluggish. Keeping one process warm turns those calls into
// tens of milliseconds and lets us pre-load the Win32 interop type once instead
// of on every call.
//
// The worker is strictly a performance layer: `runPowerShell` in powershell.ts
// stays as the fallback, and every caller must keep working if the worker dies
// (it is respawned lazily on the next request).

import { spawn, ChildProcess } from 'node:child_process';

const SENTINEL = '<<<OPPORTUNITYOS_PS_DONE>>>';

/**
 * Win32 interop pre-loaded into the worker.
 *
 * `Force` is the standard foreground-lock dance: a background process (this
 * server) is not allowed to raise a window, which is exactly why opening a
 * folder only made the taskbar button blink. Releasing the lock with a
 * synthetic ALT tap and attaching to the current foreground thread's input
 * queue makes SetForegroundWindow succeed.
 *
 * C# 5 only — Add-Type on Windows PowerShell 5.1 has no `out var`/discards.
 */
const WIN32_TYPE = `
using System;
using System.Runtime.InteropServices;
public static class OppyWin {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint from, uint to, bool attach);
  [DllImport("user32.dll")] public static extern void keybd_event(byte key, byte scan, uint flags, IntPtr extra);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  public static bool Force(IntPtr h) {
    if (h == IntPtr.Zero) return false;
    // Tap ALT: Windows releases the foreground lock for the process that owns
    // the most recent input event, so this makes SetForegroundWindow legal.
    keybd_event(0x12, 0, 0, IntPtr.Zero);
    keybd_event(0x12, 0, 2, IntPtr.Zero);
    uint pid = 0;
    IntPtr fg = GetForegroundWindow();
    uint fgThread = GetWindowThreadProcessId(fg, out pid);
    uint myThread = GetCurrentThreadId();
    bool attached = false;
    if (fgThread != 0 && fgThread != myThread) attached = AttachThreadInput(myThread, fgThread, true);
    if (IsIconic(h)) ShowWindow(h, 9); else ShowWindow(h, 5);
    BringWindowToTop(h);
    bool ok = SetForegroundWindow(h);
    if (attached) AttachThreadInput(myThread, fgThread, false);
    return ok;
  }
}
`;

/**
 * Read base64 scripts off stdin, run each one, then print the sentinel. Base64
 * removes every quoting/escaping concern between Node and PowerShell, and the
 * sentinel is what frames one response.
 */
const BOOTSTRAP = [
  `$ErrorActionPreference='SilentlyContinue'`,
  `$ProgressPreference='SilentlyContinue'`,
  `Add-Type -TypeDefinition @'${WIN32_TYPE}'@`,
  // Shell.Application costs a few hundred ms to instantiate; the worker outlives
  // every request, so create it once and let the folder-open script reuse it.
  `$global:OppyShell=New-Object -ComObject Shell.Application`,
  `[Console]::Out.WriteLine('${SENTINEL}')`,
  `[Console]::Out.Flush()`,
  `while($true){`,
  `  $line=[Console]::In.ReadLine()`,
  `  if($line -eq $null){break}`,
  `  if($line.Trim() -eq ''){continue}`,
  `  try{ & ([scriptblock]::Create([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($line)))) }catch{}`,
  `  [Console]::Out.WriteLine('${SENTINEL}')`,
  `  [Console]::Out.Flush()`,
  `}`,
].join("\n");

interface Pending {
  resolve: (out: string) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

let child: ChildProcess | null = null;
let buffer = '';
let ready = false;
/** Requests are serialised: one PowerShell pipeline, one response frame at a time. */
const queue: { script: string; timeoutMs: number; pending: Pending }[] = [];
let current: Pending | null = null;
let disabled = false;

const kill = (reason: string) => {
  const err = new Error(reason);
  if (current) { clearTimeout(current.timer); current.reject(err); current = null; }
  while (queue.length) { const q = queue.shift()!; clearTimeout(q.pending.timer); q.pending.reject(err); }
  if (child) { try { child.kill(); } catch { /* already gone */ } }
  child = null;
  ready = false;
  buffer = '';
};

const pump = () => {
  if (!child || !ready || current || queue.length === 0) return;
  const next = queue.shift()!;
  current = next.pending;
  try {
    child.stdin!.write(Buffer.from(next.script, 'utf8').toString('base64') + '\n');
  } catch (err: any) {
    kill(err?.message || 'PowerShell worker stdin closed');
  }
};

const onChunk = (chunk: Buffer) => {
  buffer += chunk.toString('utf8');
  let idx = buffer.indexOf(SENTINEL);
  while (idx !== -1) {
    const frame = buffer.slice(0, idx);
    buffer = buffer.slice(idx + SENTINEL.length).replace(/^\r?\n/, '');
    if (!ready) {
      ready = true;            // first frame is the bootstrap's own handshake
    } else if (current) {
      clearTimeout(current.timer);
      current.resolve(frame.trim());
      current = null;
    }
    idx = buffer.indexOf(SENTINEL);
  }
  pump();
};

const ensureWorker = (): boolean => {
  if (disabled || process.platform !== 'win32') return false;
  if (child) return true;
  try {
    const encoded = Buffer.from(BOOTSTRAP, 'utf16le').toString('base64');
    child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NoLogo', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] }
    );
    child.stdout!.on('data', onChunk);
    child.on('exit', () => kill('PowerShell worker exited'));
    child.on('error', () => kill('PowerShell worker could not start'));
    return true;
  } catch {
    child = null;
    return false;
  }
};

/** Start the worker ahead of the first request so the first open is fast too. */
export const warmUpPowerShell = (): void => { ensureWorker(); };

/** Permanently stop using the worker (used when the process is shutting down). */
export const shutdownPowerShellWorker = (): void => { disabled = true; kill('shutting down'); };

/**
 * Run a script on the warm worker. Rejects if the worker is unavailable so the
 * caller can fall back to a one-shot `runPowerShell`.
 */
export const runWarmPowerShell = (script: string, timeoutMs = 8000): Promise<string> =>
  new Promise((resolve, reject) => {
    if (!ensureWorker()) { reject(new Error('PowerShell worker unavailable')); return; }
    const pending: Pending = {
      resolve,
      reject,
      timer: setTimeout(() => {
        // A hung script poisons the single pipeline — restart rather than wait.
        kill(`PowerShell worker timed out after ${timeoutMs}ms`);
      }, timeoutMs),
    };
    queue.push({ script, timeoutMs, pending });
    pump();
  });
