import { transformTool } from '../panel.js';

// --- UTF-8 safe Base64 ---
function utf8ToB64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function b64ToUtf8(b64) {
  const bin = atob(b64.trim().replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
function b64urlToUtf8(part) {
  let s = part.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return b64ToUtf8(s);
}

/**
 * Decode one JWT segment, naming the part that failed. Segment count alone does
 * not tell you much — "not.a.jwt" has three of them — so a bad segment has to
 * report itself rather than surface a raw JSON.parse message.
 */
function decodeJwtSegment(segment, label) {
  let json;
  try {
    json = b64urlToUtf8(segment);
  } catch {
    throw new Error(`The ${label} segment is not valid base64url.`);
  }
  try {
    return JSON.parse(json);
  } catch {
    throw new Error(`The ${label} segment did not decode to JSON — this does not look like a JWT.`);
  }
}

const htmlEscapes = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export default [
  {
    id: 'b64-encode', category: 'Encode', name: 'Base64 Encode', title: 'Base64 Encode',
    desc: 'Encode text to Base64 (UTF-8 safe).',
    mount: transformTool({ actionLabel: 'Encode', live: true, placeholder: 'hello world', transform: utf8ToB64, pipeTo: 'b64-decode', pipeLabel: 'Decode' }),
  },
  {
    id: 'b64-decode', category: 'Encode', name: 'Base64 Decode', title: 'Base64 Decode',
    desc: 'Decode Base64 back to text.',
    mount: transformTool({
      actionLabel: 'Decode', live: true, placeholder: 'aGVsbG8gd29ybGQ=',
      transform: (s) => b64ToUtf8(s), pipeTo: 'b64-encode', pipeLabel: 'Encode',
    }),
  },
  {
    id: 'url-encode', category: 'Encode', name: 'URL Encode', title: 'URL Encode',
    desc: 'Percent-encode a string for safe use in a URL.',
    mount: transformTool({ live: true, placeholder: 'name=John Doe & co', transform: (s) => encodeURIComponent(s), pipeTo: 'url-decode', pipeLabel: 'Decode' }),
  },
  {
    id: 'url-decode', category: 'Encode', name: 'URL Decode', title: 'URL Decode',
    desc: 'Decode a percent-encoded string.',
    mount: transformTool({ live: true, placeholder: 'name%3DJohn%20Doe', transform: (s) => decodeURIComponent(s), pipeTo: 'url-encode', pipeLabel: 'Encode' }),
  },
  {
    id: 'html-encode', category: 'Encode', name: 'HTML Escape', title: 'HTML Escape',
    desc: 'Escape characters that are special in HTML (&, <, >, ", \').',
    mount: transformTool({ live: true, placeholder: '<div class="x">Tom & Jerry</div>', transform: (s) => s.replace(/[&<>"']/g, (c) => htmlEscapes[c]), pipeTo: 'html-decode', pipeLabel: 'Unescape' }),
  },
  {
    id: 'html-decode', category: 'Encode', name: 'HTML Unescape', title: 'HTML Unescape',
    desc: 'Turn HTML entities back into their characters.',
    mount: transformTool({
      live: true, placeholder: '&lt;div&gt;Tom &amp; Jerry&lt;/div&gt;',
      transform: (s) => {
        const doc = new DOMParser().parseFromString(s, 'text/html');
        return doc.documentElement.textContent;
      },
      pipeTo: 'html-encode', pipeLabel: 'Escape',
    }),
  },
  {
    id: 'jwt-decode', category: 'Encode', name: 'JWT Decode', title: 'JWT Decode',
    desc: 'Decode a JSON Web Token into its header and payload. (Signature is not verified.)',
    mount: transformTool({
      actionLabel: 'Decode', live: true,
      placeholder: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.sig',
      transform: (s) => {
        const parts = s.trim().split('.');
        if (parts.length < 2) throw new Error('Not a JWT. Expected at least two dot-separated segments.');
        const header = decodeJwtSegment(parts[0], 'header');
        const payload = decodeJwtSegment(parts[1], 'payload');
        let out = 'HEADER\n' + JSON.stringify(header, null, 2) + '\n\nPAYLOAD\n' + JSON.stringify(payload, null, 2);
        if (payload.exp) {
          const d = new Date(payload.exp * 1000);
          out += `\n\nexp → ${d.toISOString()} (${d < new Date() ? 'expired' : 'valid'})`;
        }
        return out;
      },
    }),
  },
];
