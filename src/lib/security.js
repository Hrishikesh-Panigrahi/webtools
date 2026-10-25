// Guards for everything that crosses a trust boundary: text rendered as HTML,
// URLs placed in links, state read back out of a shared link, and input that
// looks like a credential before it is saved or shared.
//
// The site never sends anything over the network, so the threats are local
// ones: a crafted link that injects markup or script, and secrets lingering
// in storage or leaking through a copied URL.

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** `text` with every HTML-special character escaped, safe inside elements and quoted attributes. */
export const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);

const SAFE_SCHEMES = new Set(['http', 'https', 'mailto']);

/**
 * Whether `url` may go in an href: http(s), mailto, or a relative link.
 * Browsers ignore control characters and whitespace inside a scheme, so
 * "java\tscript:" still runs script — those are stripped before checking.
 */
export function isSafeUrl(url) {
  const compact = String(url).replace(/[\u0000- \u007F-\u009F]/g, '');
  const scheme = /^([a-z][a-z\d+.-]*):/i.exec(compact);
  return scheme ? SAFE_SCHEMES.has(scheme[1].toLowerCase()) : true;
}

// A shared link is written by whoever sent it, so its state is checked
// before any of it reaches a control.
const MAX_STATE_VALUES = 64;
const MAX_STATE_TEXT = 5_000_000;

/** `values` when it is a short list of strings and booleans, otherwise null. */
export function sanitizeStateValues(values) {
  if (!Array.isArray(values) || values.length > MAX_STATE_VALUES) return null;
  const isPlainValue = (value) => typeof value === 'boolean' || (typeof value === 'string' && value.length <= MAX_STATE_TEXT);
  return values.every(isPlainValue) ? values : null;
}

// Bounded quantifiers throughout: these run over whole inputs, and an
// unbounded run would rescan a long token from every start position.
const SECRET_PATTERNS = [
  ['a JWT', /\beyJ[\w-]{8,2048}\.eyJ[\w-]{8,8192}\./],
  ['a private key', /-----BEGIN (?:[A-Z]+ ){0,3}PRIVATE KEY-----/],
  ['an AWS access key', /\b(?:AKIA|ASIA)[\dA-Z]{16}\b/],
  ['a GitHub token', /\bgh[pousr]_[A-Za-z\d]{36,255}\b/],
  ['a Slack token', /\bxox[abprs]-[\w-]{10,255}/],
  ['an API key', /\bsk-(?:ant-|proj-|live_)?[\w-]{20,255}/],
  ['a bearer token', /\bBearer\s{1,8}[\w.~+/-]{20,4096}/],
  ['a password in a URL', /\b[a-z][\w+.-]{0,30}:\/\/[^\s/:@]{1,256}:[^\s/@]{1,256}@/i],
];
const MAX_SCANNED = 200_000;

/** What kind of credential `text` seems to contain ("a JWT", "a private key"…), or null. */
export function findSecret(text) {
  const sample = text.length > MAX_SCANNED ? text.slice(0, MAX_SCANNED) : text;
  return SECRET_PATTERNS.find(([, pattern]) => pattern.test(sample))?.[0] ?? null;
}
