import DOMPurify from 'dompurify';

/** Sanitizes untrusted HTML at every application rendering boundary. */
export const sanitizeHtml = (value: unknown): string => DOMPurify.sanitize(
  typeof value === 'string' ? value : '',
  {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['base', 'embed', 'iframe', 'link', 'math', 'meta', 'object', 'script', 'style', 'svg'],
    FORBID_ATTR: ['action', 'formaction', 'srcset', 'style'],
    ALLOW_DATA_ATTR: true,
  },
);
