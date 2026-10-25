import { transformTool } from '../ui/panel.js';
import { positionedError } from '../lib/text.js';
import { escapeHtml } from '../lib/security.js';

// --- UTF-8 safe Base64 ---

// Converting a byte at a time took over a second on a megabyte; whole chunks
// keep it fast while staying under the engine's argument-count limit.
const BYTES_PER_CHUNK = 0x8000;

function utf8ToB64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let start = 0; start < bytes.length; start += BYTES_PER_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(start, start + BYTES_PER_CHUNK));
  }
  return btoa(binary);
}

// Accepts the URL-safe alphabet (- and _) and missing padding too, since a
// token copied out of a URL or a JWT usually has both.
function b64ToUtf8(b64) {
  const invalid = /[^A-Za-z\d+/=\s_-]/.exec(b64);
  if (invalid) {
    throw positionedError(`"${invalid[0]}" is not a Base64 character.`, b64, invalid.index,
      'Base64 uses A–Z, a–z, 0–9, + and / (or - and _ in the URL-safe form), with = as padding.');
  }
  const earlyPadding = /=+(?=\s*[^=\s])/.exec(b64);
  if (earlyPadding) {
    throw positionedError('Padding "=" can only appear at the end.', b64, earlyPadding.index,
      'Two Base64 strings may have been pasted together. Decode them one at a time.');
  }
  let normalized = b64.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if (normalized.length % 4 === 1) throw new Error('This Base64 is one character too long or too short — it may be truncated.');
  while (normalized.length % 4) normalized += '=';
  const bin = atob(normalized);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function decodePercent(text) {
  try {
    return decodeURIComponent(text);
  } catch {
    const stray = /%(?![\dA-F]{2})/i.exec(text);
    if (stray) throw positionedError('A "%" must be followed by two hex digits.', text, stray.index, 'Write %25 for a literal percent sign.');
    throw new Error('The percent-escapes do not decode to valid UTF-8 text.');
  }
}

/**
 * Decode one JWT segment, naming the part that failed. Segment count alone does
 * not tell you much — "not.a.jwt" has three of them — so a bad segment has to
 * report itself rather than surface a raw JSON.parse message.
 */
function decodeJwtSegment(segment, label) {
  let json;
  try {
    json = b64ToUtf8(segment);
  } catch {
    throw new Error(`The ${label} segment is not valid base64url.`);
  }
  try {
    return JSON.parse(json);
  } catch {
    throw new Error(`The ${label} segment did not decode to JSON — this does not look like a JWT.`);
  }
}

const TIME_CLAIMS = { exp: 'expires', iat: 'issued', nbf: 'not before' };
const relativeTime = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

function describeRelative(date) {
  const seconds = (date.getTime() - Date.now()) / 1000;
  const units = [['year', 31536000], ['day', 86400], ['hour', 3600], ['minute', 60], ['second', 1]];
  const [unit, size] = units.find(([, length]) => Math.abs(seconds) >= length) ?? units.at(-1);
  return relativeTime.format(Math.round(seconds / size), unit);
}

// The registered time claims are epoch seconds, which nobody reads at a glance.
function describeTimeClaims(payload) {
  return Object.entries(TIME_CLAIMS)
    .filter(([claim]) => Number.isFinite(payload[claim]))
    .map(([claim, meaning]) => {
      const date = new Date(payload[claim] * 1000);
      const state = claim === 'exp' ? (date < new Date() ? ' — EXPIRED' : ' — still valid') : '';
      return `${claim.padEnd(3)}  ${meaning.padEnd(10)}  ${date.toISOString()}  (${describeRelative(date)})${state}`;
    });
}

function decodeJwt(text) {
  const parts = text.trim().replace(/^Bearer\s+/i, '').split('.');
  if (parts.length < 2) throw new Error('Not a JWT. Expected at least two dot-separated segments.');
  const header = decodeJwtSegment(parts[0], 'header');
  const payload = decodeJwtSegment(parts[1], 'payload');
  const sections = [
    'HEADER\n' + JSON.stringify(header, null, 2),
    'PAYLOAD\n' + JSON.stringify(payload, null, 2),
  ];
  const times = describeTimeClaims(payload);
  if (times.length) sections.push('TIMES\n' + times.join('\n'));
  return sections.join('\n\n');
}

export default [
  {
    id: 'b64-encode', category: 'Encode', name: 'Base64 Encode', title: 'Base64 Encode',
    keywords: 'btoa base64 encode binary',
    desc: 'Encode text to Base64 (UTF-8 safe).',
    mount: transformTool({ placeholder: 'hello world', transform: utf8ToB64, pipeTo: 'b64-decode', pipeLabel: 'Decode' }),
  },
  {
    id: 'b64-decode', category: 'Encode', name: 'Base64 Decode', title: 'Base64 Decode',
    keywords: 'atob base64 decode base64url',
    desc: 'Decode Base64 back to text. The URL-safe alphabet and missing padding are accepted too.',
    mount: transformTool({
      placeholder: 'aGVsbG8gd29ybGQ=',
      transform: b64ToUtf8, pipeTo: 'b64-encode', pipeLabel: 'Encode',
    }),
  },
  {
    id: 'url-encode', category: 'Encode', name: 'URL Encode', title: 'URL Encode',
    keywords: 'percent encode encodeURIComponent query escape',
    desc: 'Percent-encode a string for safe use in a URL.',
    mount: transformTool({ placeholder: 'name=John Doe & co', transform: (s) => encodeURIComponent(s), pipeTo: 'url-decode', pipeLabel: 'Decode' }),
  },
  {
    id: 'url-decode', category: 'Encode', name: 'URL Decode', title: 'URL Decode',
    keywords: 'percent decode decodeURIComponent unescape',
    desc: 'Decode a percent-encoded string.',
    mount: transformTool({ placeholder: 'name%3DJohn%20Doe', transform: decodePercent, pipeTo: 'url-encode', pipeLabel: 'Encode' }),
  },
  {
    id: 'html-encode', category: 'Encode', name: 'HTML Escape', title: 'HTML Escape',
    keywords: 'entities encode sanitize xss',
    desc: 'Escape characters that are special in HTML (&, <, >, ", \').',
    mount: transformTool({ placeholder: '<div class="x">Tom & Jerry</div>', transform: escapeHtml, pipeTo: 'html-decode', pipeLabel: 'Unescape' }),
  },
  {
    id: 'html-decode', category: 'Encode', name: 'HTML Unescape', title: 'HTML Unescape',
    keywords: 'entities decode',
    desc: 'Turn HTML entities back into their characters.',
    mount: transformTool({
      placeholder: '&lt;div&gt;Tom &amp; Jerry&lt;/div&gt;',
      transform: (s) => {
        const doc = new DOMParser().parseFromString(s, 'text/html');
        return doc.documentElement.textContent;
      },
      pipeTo: 'html-encode', pipeLabel: 'Escape',
    }),
  },
  {
    id: 'jwt-decode', category: 'Encode', name: 'JWT Decode', title: 'JWT Decode', sensitive: true,
    keywords: 'json web token bearer auth claims oauth',
    desc: 'Decode a JSON Web Token into its header, payload and readable expiry times. (Signature is not verified.)',
    mount: transformTool({
      placeholder: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0IiwibmFtZSI6IkFkYSBMb3ZlbGFjZSIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoxOTAwMDAwMDAwfQ.c2lnbmF0dXJl',
      wrapOutput: false,
      transform: decodeJwt,
    }),
  },
];
