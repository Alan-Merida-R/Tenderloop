# If an OpportunityOS window is already open, bring it to front (or restore it
# if minimized) on one hotkey press, and minimize it on the next — instead of
# opening yet another window on top of the running one. Prints NOT_RUNNING and
# exits 1 when no window is found, so the caller (OPEN_OPPORTUNITYOS.vbs) knows
# to fall through to the normal start-the-server-and-open-a-window flow.
$ErrorActionPreference = 'Stop'

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;

public class OpportunityOSWindow {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();

    public static List<IntPtr> FindByTitle(string title) {
        var results = new List<IntPtr>();
        EnumWindows(delegate(IntPtr hWnd, IntPtr lParam) {
            if (!IsWindowVisible(hWnd)) return true;
            int len = GetWindowTextLength(hWnd);
            if (len == 0) return true;
            var sb = new StringBuilder(len + 1);
            GetWindowText(hWnd, sb, sb.Capacity);
            if (sb.ToString() == title) results.Add(hWnd);
            return true;
        }, IntPtr.Zero);
        return results;
    }
}
"@

# Only match windows owned by a browser process, so a coincidentally-titled
# window from an unrelated app is never toggled.
$browserProcessNames = @('chrome', 'chrome_proxy', 'msedge', 'vivaldi', 'brave')
$candidates = [OpportunityOSWindow]::FindByTitle('OpportunityOS')

$target = [IntPtr]::Zero
foreach ($hwnd in $candidates) {
    $procId = 0
    [OpportunityOSWindow]::GetWindowThreadProcessId($hwnd, [ref]$procId) | Out-Null
    try {
        $proc = Get-Process -Id $procId -ErrorAction Stop
        if ($browserProcessNames -contains $proc.ProcessName) { $target = $hwnd; break }
    } catch {}
}

if ($target -eq [IntPtr]::Zero) {
    Write-Output "NOT_RUNNING"
    exit 1
}

$SW_RESTORE = 9
$SW_MINIMIZE = 6

# Deliberately just two states (minimized vs not), not three. A "is this
# actually the foreground window right now" check is unreliable here: this
# script itself is spawned as a new process each time it runs, and Windows
# can briefly hand that new process foreground status, making the running
# OpportunityOS window look "not foreground" even when it visibly still is.
if ([OpportunityOSWindow]::IsIconic($target)) {
    [OpportunityOSWindow]::ShowWindow($target, $SW_RESTORE) | Out-Null
    [OpportunityOSWindow]::SetForegroundWindow($target) | Out-Null
    Write-Output "RESTORED"
} else {
    [OpportunityOSWindow]::ShowWindow($target, $SW_MINIMIZE) | Out-Null
    Write-Output "MINIMIZED"
}
exit 0
