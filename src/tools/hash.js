import { h, copyBtn } from '../dom.js';

const ALGOS = ['SHA-256', 'SHA-1', 'SHA-384', 'SHA-512'];

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hashMount(body) {
  const input = h('textarea', { class: 'io-textarea', placeholder: 'Text to hash…', spellcheck: 'false' });
  const output = h('textarea', { class: 'io-textarea', readonly: true, spellcheck: 'false' });
  const select = h('select', { class: 'select' }, ...ALGOS.map((a) => h('option', {}, a)));

  const run = async () => {
    if (!input.value) { output.value = ''; return; }
    const data = new TextEncoder().encode(input.value);
    const digest = await crypto.subtle.digest(select.value, data);
    output.value = toHex(digest);
  };
  input.addEventListener('input', run);
  select.addEventListener('change', run);

  body.append(
    h('div', { class: 'io-box' }, h('div', { class: 'io-label' }, 'Input'), input),
    h('div', { class: 'tool-actions' }, h('span', { class: 'io-label' }, 'Algorithm'), select),
    h('div', { class: 'io-box' },
      h('div', { class: 'io-label-row' }, h('span', { class: 'io-label' }, 'Digest (hex)'), copyBtn(() => output.value)),
      output,
    ),
  );
  input.focus();
}

function uuidMount(body) {
  const count = h('input', { class: 'part-input', type: 'number', min: '1', max: '100', value: '5', style: 'max-width:5rem' });
  const output = h('textarea', { class: 'io-textarea tall', readonly: true, spellcheck: 'false' });
  const gen = () => {
    const n = Math.min(100, Math.max(1, +count.value || 1));
    output.value = Array.from({ length: n }, () => crypto.randomUUID()).join('\n');
  };
  body.append(
    h('div', { class: 'tool-actions' },
      h('span', { class: 'io-label' }, 'How many'), count,
      h('button', { class: 'btn btn-primary btn-sm', type: 'button', onClick: gen }, 'Generate'),
    ),
    h('div', { class: 'io-box' },
      h('div', { class: 'io-label-row' }, h('span', { class: 'io-label' }, 'UUID v4'), copyBtn(() => output.value)),
      output,
    ),
  );
  gen();
}

export default [
  { id: 'hash-sha', category: 'Crypto', name: 'SHA Hash', title: 'SHA Hashing', desc: 'Compute a SHA-1/256/384/512 digest with the browser\'s Web Crypto API.', mount: hashMount },
  { id: 'uuid-v4', category: 'Crypto', name: 'UUID v4', title: 'UUID v4 Generator', desc: 'Generate cryptographically-random version-4 UUIDs.', mount: uuidMount },
];
