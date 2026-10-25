import { h } from '../ui/dom.js';
import { copyButton } from '../ui/buttons.js';
import { transformTool } from '../ui/panel.js';

const ALPHABET_LENGTH = 26;

/** `amount` reduced to 0–25, so negative and oversized shifts wrap around. */
const normalizeShift = (amount) => ((amount % ALPHABET_LENGTH) + ALPHABET_LENGTH) % ALPHABET_LENGTH;

/** Shift every Latin letter by `amount`, keeping case; everything else passes through. */
function shiftLetters(text, amount) {
  const shift = normalizeShift(amount);
  return text.replace(/[a-z]/gi, (letter) => {
    const base = letter <= 'Z' ? 65 : 97;
    return String.fromCharCode(((letter.charCodeAt(0) - base + shift) % ALPHABET_LENGTH) + base);
  });
}

function caesarMount(body) {
  const input = h('textarea', { class: 'io-textarea', placeholder: 'Attack at dawn', spellcheck: 'false' });
  const output = h('textarea', { class: 'io-textarea', readonly: true, spellcheck: 'false' });
  const shiftSlider = h('input', { type: 'range', min: '0', max: '25', value: '3', class: 'slider' });
  const shiftField = h('input', { type: 'number', min: '-25', max: '25', value: '3', class: 'part-input', style: 'max-width:5rem', 'aria-label': 'Shift amount' });

  const run = () => { output.value = shiftLetters(input.value, Number(shiftField.value) || 0); };
  input.addEventListener('input', run);
  shiftSlider.addEventListener('input', () => { shiftField.value = shiftSlider.value; run(); });
  shiftField.addEventListener('input', () => { shiftSlider.value = normalizeShift(Number(shiftField.value) || 0); run(); });

  body.append(
    h('div', { class: 'io-box' }, h('div', { class: 'io-label' }, 'Text'), input),
    h('div', { class: 'tool-actions' },
      h('span', { class: 'io-label' }, 'Shift'), shiftSlider, shiftField,
    ),
    h('div', { class: 'io-box' },
      h('div', { class: 'io-label-row' }, h('span', { class: 'io-label' }, 'Result'), copyButton(() => output.value)),
      output,
    ),
  );
  input.focus();
}

export default [
  { id: 'cipher-caesar', category: 'Cipher', name: 'Caesar', title: 'Caesar Cipher', keywords: 'shift rotate', desc: 'Shift each letter by a fixed amount. Use a negative shift to decode.', mount: caesarMount },
  {
    id: 'cipher-rot13', category: 'Cipher', name: 'ROT13', title: 'ROT13',
    desc: 'Rotate letters by 13. Run it again to decode.',
    keywords: 'rotate obfuscate',
    mount: transformTool({ placeholder: 'Hello, World', transform: (text) => shiftLetters(text, 13) }),
  },
];
