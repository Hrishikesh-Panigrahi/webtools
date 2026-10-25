// Guess what a pasted snippet is, so the home page and the command palette can
// offer the right tool for it. Each rule is cheap and anchored: this runs on
// every keystroke in the palette, and a paste can be megabytes.

import { isRepairable } from './json.js';

const MAX_SUGGESTIONS = 4;
// Token-shaped rules (a color, an IP, a cron line) only make sense on short
// input, and capping the length also caps what their regexes can scan.
const MAX_TOKEN_LENGTH = 200;
// The prose-shaped rules only look at the start of a large paste.
const SAMPLE_LENGTH = 2000;

const JWT = /^eyJ[\w-]+\.[\w-]*(?:\.[\w-]*)?$/;
const URL_PATTERN = /^[a-z][a-z\d+.-]*:\/\/[^\s]+$/i;
const PERCENT_ESCAPE = /%[\dA-F]{2}/i;
const EPOCH = /^-?\d{9,13}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/i;
const CRON_SHORTHAND = /^@(?:yearly|annually|monthly|weekly|daily|midnight|hourly)$/i;
const CRON_FIELD = /^(?:[\d*?LW#]+(?:[-/,][\d*LW#]+)*|[a-z]{3}(?:[-,][a-z]{3})*)$/i;
const HEX_COLOR = /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i;
const FUNCTIONAL_COLOR = /^(?:rgba?|hsla?)\(\s*[\d.]+%?\s*[, ]\s*[\d.]+%?\s*[, ]\s*[\d.]+%?(?:\s*[,/]\s*[\d.]+%?)?\s*\)$/i;
const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?(?:\s+(?:\d{1,3}\.){3}\d{1,3})?$/;
const IPV6 = /^[\da-f]{0,4}(?::[\da-f]{0,4}){2,7}(?:\/\d{1,3})?$/i;
const USER_AGENT = /^Mozilla\/\d|^[\w.-]+\/[\d.]+ \(|(?:AppleWebKit|Gecko|Chrome|Safari|Firefox)\/[\d.]+/;
const BASE64 = /^[A-Za-z\d+/]+={0,2}$/;
const HTML_ENTITY = /&(?:#\d+|#x[\da-f]+|[a-z]+\d*);/i;
const HTML_TAG = /<\/?[a-z][a-z\d-]*(?:\s[^<>]*)?\/?>/i;
const MARKDOWN = /^#{1,6} \S|^```|^[ \t]*(?:[-*+]|\d+\.) \S[^\n]*\n[ \t]*(?:[-*+]|\d+\.) |\*\*[^*\n]+\*\*|\[[^\]\n]+\]\([^)\s]+\)/m;

function looksLikeCron(text) {
  if (CRON_SHORTHAND.test(text)) return true;
  const fields = text.split(/\s+/);
  if (fields.length !== 5 && fields.length !== 6) return false;
  return fields.every((field) => CRON_FIELD.test(field)) && fields.some((field) => /[\d*]/.test(field));
}

// Base64 is also a valid spelling of plenty of ordinary words ("password" is
// eight letters from the alphabet), so the decoded bytes must read as text.
function looksLikeBase64(text) {
  const compact = text.replace(/\s+/g, '');
  if (compact.length < 12 || compact.length % 4 !== 0 || !BASE64.test(compact)) return false;
  if (!/[A-Z]/.test(compact) || !/[a-z\d+/]/.test(compact)) return false;
  try {
    const sample = compact.slice(0, SAMPLE_LENGTH).replace(/=+$/, '');
    const bytes = Uint8Array.from(atob(sample.slice(0, sample.length - (sample.length % 4))), (char) => char.charCodeAt(0));
    // `stream` holds back a multi-byte character the sample cut in half
    // instead of reporting it as malformed.
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes, { stream: true });
    if (!decoded) return false;
    const unreadable = decoded.match(/[\u0000-\u0008\u000E-\u001F�]/g)?.length ?? 0;
    return unreadable / decoded.length < 0.02;
  } catch {
    return false;
  }
}

function looksLikeCsv(text) {
  // The sixth piece may be the unsplit remainder, so only the first five count.
  const lines = text.split('\n', 6).slice(0, 5);
  if (lines.length < 2) return false;
  const commas = lines.map((line) => (line.match(/,/g) ?? []).length);
  return commas[0] > 0 && commas.every((count) => count === commas[0]);
}

function detectJson(text, add) {
  if (!/^[[{]/.test(text)) return;
  try {
    JSON.parse(text);
    add('json-prettify', 'JSON');
    add('json-types', 'JSON');
  } catch {
    add('json-prettify', isRepairable(text) ? 'JSON with fixable mistakes' : 'JSON with errors');
  }
}

/**
 * Suggest tools for `input`, most likely first.
 * @returns {{ id: string, kind: string }[]}  tool id plus what the input looks like
 */
export function detectContent(input) {
  const text = input.trim();
  if (!text) return [];
  const suggestions = [];
  const add = (id, kind) => {
    if (!suggestions.some((suggestion) => suggestion.id === id)) suggestions.push({ id, kind });
  };

  const isSingleLine = !text.includes('\n');
  const isToken = isSingleLine && text.length <= MAX_TOKEN_LENGTH;
  const sample = text.slice(0, SAMPLE_LENGTH);

  if (isSingleLine && JWT.test(text.replace(/^Bearer\s+/i, ''))) add('jwt-decode', 'a JWT');
  if (/^curl\s/i.test(text)) add('curl-fetch', 'a cURL command');
  detectJson(text, add);

  if (isSingleLine) {
    if (URL_PATTERN.test(text)) {
      add('url-parse', 'a URL');
      if (PERCENT_ESCAPE.test(text)) add('url-decode', 'a percent-encoded URL');
      add('qr-generate', 'a URL');
    }
    if (USER_AGENT.test(text)) add('net-useragent', 'a User-Agent string');
    if (PERCENT_ESCAPE.test(text) && !/\s/.test(text)) add('url-decode', 'percent-encoded text');
  }
  if (isToken) {
    if (EPOCH.test(text)) add('time-unix', 'a Unix timestamp');
    if (ISO_DATE.test(text)) add('time-unix', 'a date');
    if (looksLikeCron(text)) add('cron-explain', 'a cron expression');
    if (HEX_COLOR.test(text) || FUNCTIONAL_COLOR.test(text)) add('color-convert', 'a color');
    if (IPV4.test(text) || (text.includes(':') && IPV6.test(text))) add('net-ip', 'an IP address');
  }

  if (looksLikeBase64(text)) add('b64-decode', 'Base64');
  if (HTML_ENTITY.test(sample)) add('html-decode', 'HTML entities');
  if (HTML_TAG.test(sample)) add('html-encode', 'HTML');
  if (MARKDOWN.test(sample)) add('md-preview', 'Markdown');
  if (looksLikeCsv(text)) add('csv-json', 'CSV');

  return suggestions.slice(0, MAX_SUGGESTIONS);
}
