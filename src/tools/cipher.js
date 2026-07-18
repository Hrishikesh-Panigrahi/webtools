import { h, copyBtn } from '../dom.js';
import { transformTool } from '../panel.js';

function shift(str, n) {
  return str.replace(/[a-z]/gi, (c) => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + (n % 26) + 26) % 26) + base);
  });
}

function caesarMount(body) {
  const input = h('textarea', { class: 'io-textarea', placeholder: 'Attack at dawn', spellcheck: 'false' });
  const output = h('textarea', { class: 'io-textarea', readonly: true, spellcheck: 'false' });
  const range = h('input', { type: 'range', min: '0', max: '25', value: '3', class: 'slider' });
  const num = h('input', { type: 'number', min: '-25', max: '25', value: '3', class: 'part-input', style: 'max-width:5rem' });

  const run = () => { output.value = shift(input.value, +num.value || 0); };
  const sync = (v) => { range.value = ((+v % 26) + 26) % 26; num.value = v; run(); };
  input.addEventListener('input', run);
  range.addEventListener('input', () => sync(range.value));
  num.addEventListener('input', () => { range.value = ((+num.value % 26) + 26) % 26; run(); });

  body.append(
    h('div', { class: 'io-box' }, h('div', { class: 'io-label' }, 'Text'), input),
    h('div', { class: 'tool-actions' },
      h('span', { class: 'io-label' }, 'Shift'), range, num,
    ),
    h('div', { class: 'io-box' },
      h('div', { class: 'io-label-row' }, h('span', { class: 'io-label' }, 'Result'), copyBtn(() => output.value)),
      output,
    ),
  );
  input.focus();
}

export default [
  { id: 'cipher-caesar', category: 'Cipher', name: 'Caesar', title: 'Caesar Cipher', desc: 'Shift each letter by a fixed amount. Use a negative shift to decode.', mount: caesarMount },
  {
    id: 'cipher-rot13', category: 'Cipher', name: 'ROT13', title: 'ROT13',
    desc: 'Rotate letters by 13 — its own inverse, so the same action encodes and decodes.',
    mount: transformTool({ live: true, placeholder: 'Hello, World', transform: (s) => shift(s, 13) }),
  },
];
