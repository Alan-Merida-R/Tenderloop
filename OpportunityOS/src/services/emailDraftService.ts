// Frontend client for the local helper's Outlook draft endpoint.
// Same base URL as features/opportunity-folder/fileOps.ts (OPEN_HELPER_URL).

const HELPER_BASE = 'http://127.0.0.1:3099';

export interface ComposeEmailRequest {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  htmlBody: string;
  /** Absolute Windows paths of the files to attach. */
  attachments: string[];
  mode?: 'auto' | 'com' | 'eml';
}

export interface ComposeEmailResponse {
  ok: boolean;
  /** Set when ok is true. */
  openedWith?: 'com' | 'eml';
  /** Set when ok is false. */
  error?: string;
  missingAttachments?: string[];
}

export interface CopyReplyResponse {
  ok: boolean;
  attachmentCount: number;
  missingAttachments: string[];
  error?: string;
}

export const copyReplyToClipboard = async (html: string, text: string, attachments: string[]): Promise<CopyReplyResponse> => {
  try {
    const res = await fetch(`${HELPER_BASE}/api/os/clipboard-email-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html, text, attachments }),
    });
    const data = await res.json().catch(() => ({}));
    return {
      ok: res.ok && !!data.ok,
      attachmentCount: Number(data.attachmentCount) || 0,
      missingAttachments: data.missingAttachments || [],
      error: res.ok ? undefined : (data.error || `Helper responded with HTTP ${res.status}`),
    };
  } catch {
    return {
      ok: false,
      attachmentCount: 0,
      missingAttachments: [],
      error: 'OpportunityOS helper is not running (port 3099).',
    };
  }
};

export const composeOutlookDraft = async (payload: ComposeEmailRequest): Promise<ComposeEmailResponse> => {
  let res: Response;
  try {
    res = await fetch(`${HELPER_BASE}/api/os/compose-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    return {
      ok: false,
      error: 'OpportunityOS helper is not running (port 3099). Launch the app with engine_opportunityos.bat or run "npm run server".',
    };
  }

  let data: any = null;
  try { data = await res.json(); } catch { /* non-JSON error body */ }

  if (res.ok && data?.ok) {
    return { ok: true, openedWith: data.openedWith === 'eml' ? 'eml' : 'com', missingAttachments: data.missingAttachments || [] };
  }
  return {
    ok: false,
    error: data?.error || `Helper responded with HTTP ${res.status}`,
    missingAttachments: data?.missingAttachments || [],
  };
};
