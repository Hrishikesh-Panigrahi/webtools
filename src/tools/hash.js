import { h, copyBtn } from '../dom.js';

const ALGOS = ['SHA-256', 'SHA-1', 'SHA-384', 'SHA-512'];

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hashMount(body) {
  const input = h('textarea', { class: 'io-textarea', placeholder: 'Text to hash…', spellcheck: 'false' });
  const output = h('textarea', { class: 'io-textarea', readonly: true, spellcheck: 'false' });
  const error = h('div', { class: 'io-error' });
  const select = h('select', { class: 'select' }, ...ALGOS.map((a) => h('option', {}, a)));

  // Digesting is async, so a fast typist can have several in flight at once and
  // an earlier one may resolve last. Only the newest request may write output.
  let latest = 0;

  const run = async () => {
    error.textContent = '';
    if (!input.value) { output.value = ''; return; }
    const request = ++latest;
    const data = new TextEncoder().encode(input.value);
    try {
      const digest = await crypto.subtle.digest(select.value, data);
      if (request === latest) output.value = toHex(digest);
    } catch {
      if (request !== latest) return;
      output.value = '';
      error.textContent = 'Web Crypto needs a secure context. Open this page over https or on localhost.';
    }
  };
  input.addEventListener('input', run);
  select.addEventListener('change', run);

  body.append(
    h('div', { class: 'io-box' }, h('div', { class: 'io-label' }, 'Input'), input),
    h('div', { class: 'tool-actions' }, h('span', { class: 'io-label' }, 'Algorithm'), select),
    h('div', { class: 'io-box' },
      h('div', { class: 'io-label-row' }, h('span', { class: 'io-label' }, 'Digest (hex)'), copyBtn(() => output.value)),
      output,
      error,
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

const CHAR_SETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.<>/?',
};

// Uniform random index in [0, size) via rejection sampling — no modulo bias.
function randomIndex(size) {
  const limit = Math.floor(0x100000000 / size) * size;
  const buf = new Uint32Array(1);
  let n;
  do { crypto.getRandomValues(buf); n = buf[0]; } while (n >= limit);
  return n % size;
}

function passwordMount(body) {
  const length = h('input', { type: 'number', class: 'part-input', min: '4', max: '128', value: '20', style: 'max-width:5rem' });
  const output = h('textarea', { class: 'io-textarea', readonly: true, spellcheck: 'false', style: 'min-height:80px' });
  const strength = h('div', { class: 'rx-info' });

  const toggles = {};
  const poolRow = h('div', { class: 'toggle-row' });
  const defaults = { lower: true, upper: true, digits: true, symbols: false };
  for (const key of Object.keys(CHAR_SETS)) {
    const box = h('input', { type: 'checkbox', ...(defaults[key] ? { checked: true } : {}) });
    toggles[key] = box;
    poolRow.append(h('label', { class: 'toggle' }, box, h('span', {}, `${key} (${CHAR_SETS[key].slice(0, 4)}…)`)));
  }

  const gen = () => {
    const pool = Object.keys(CHAR_SETS).filter((k) => toggles[k].checked).map((k) => CHAR_SETS[k]).join('');
    if (!pool) { output.value = ''; strength.textContent = 'Select at least one character set.'; return; }
    const n = Math.min(128, Math.max(4, Math.floor(+length.value) || 20));
    let out = '';
    for (let i = 0; i < n; i++) out += pool[randomIndex(pool.length)];
    output.value = out;
    const bits = Math.round(n * Math.log2(pool.length));
    strength.textContent = `${n} chars · ${pool.length}-symbol pool · ~${bits} bits of entropy`;
  };

  length.addEventListener('input', gen);
  Object.values(toggles).forEach((box) => box.addEventListener('change', gen));

  body.append(
    h('div', { class: 'tool-actions' },
      h('span', { class: 'io-label' }, 'Length'), length,
      poolRow,
      h('button', { class: 'btn btn-primary btn-sm', type: 'button', onClick: gen }, 'Generate'),
    ),
    h('div', { class: 'io-box' },
      h('div', { class: 'io-label-row' }, h('span', { class: 'io-label' }, 'Password'), copyBtn(() => output.value)),
      output,
      strength,
    ),
  );
  gen();
}

export default [
  { id: 'hash-sha', category: 'Crypto', name: 'SHA Hash', title: 'SHA Hash', desc: 'Compute a SHA-1/256/384/512 digest with the browser\'s Web Crypto API.', mount: hashMount },
  { id: 'uuid-v4', category: 'Crypto', name: 'UUID v4', title: 'UUID v4 Generator', desc: 'Generate cryptographically-random version-4 UUIDs.', mount: uuidMount },
  { id: 'pw-gen', category: 'Crypto', name: 'Password', title: 'Password Generator', desc: 'Generate strong random passwords with the Web Crypto API. Pick length and character sets.', mount: passwordMount },
];
