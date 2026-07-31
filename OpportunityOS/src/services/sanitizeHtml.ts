import DOMPurify from 'dompurify';

/** Sanitizes untrusted HTML at every application rendering boundary. */
export const sanitizeHtml = (value: unknown): string => DOMPurify.sanitize(
  typeof value === 'string' ? value : '',
  {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['base', 'embed', 'iframe', 'link', 'math', 'meta', 'object', 'script', 'style', 'svg'],
    FORBID_ATTR: ['action', 'formaction', 'srcset'],
    // Inline `style` carries note highlight colors, font sizes and image sizing (see RichTextEditor
    // in OpportunityDetail.tsx). DOMPurify still strips dangerous CSS constructs (url(javascript:...),
    // expression(), -moz-binding, etc.) from whatever style values survive, so this stays safe for
    // both app-authored note HTML and externally-parsed SR email HTML.
    ALLOW_DATA_ATTR: true,
  },
);
