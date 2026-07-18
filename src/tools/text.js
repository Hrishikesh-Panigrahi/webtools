import { h, copyBtn } from '../dom.js';
import { transformTool } from '../panel.js';

const words = (s) => s.trim().split(/[\s_-]+/).filter(Boolean);

const cases = {
  'UPPERCASE': (s) => s.toUpperCase(),
  'lowercase': (s) => s.toLowerCase(),
  'Title Case': (s) => s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase()),
  'Sentence case': (s) => s.toLowerCase().replace(/(^\s*\w|[.!?]\s*\w)/g, (c) => c.toUpperCase()),
  'camelCase': (s) => words(s).map((w, i) => i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()).join(''),
  'PascalCase': (s) => words(s).map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(''),
  'snake_case': (s) => words(s).map((w) => w.toLowerCase()).join('_'),
  'kebab-case': (s) => words(s).map((w) => w.toLowerCase()).join('-'),
  'CONSTANT_CASE': (s) => words(s).map((w) => w.toUpperCase()).join('_'),
};

function caseMount(body) {
  const input = h('textarea', { class: 'io-textarea', placeholder: 'The quick brown fox', spellcheck: 'false' });
  const output = h('textarea', { class: 'io-textarea', readonly: true, spellcheck: 'false' });
  const select = h('select', { class: 'select' }, ...Object.keys(cases).map((k) => h('option', {}, k)));
  const run = () => { output.value = input.value ? cases[select.value](input.value) : ''; };
  input.addEventListener('input', run);
  select.addEventListener('change', run);
  body.append(
    h('div', { class: 'io-box' }, h('div', { class: 'io-label' }, 'Text'), input),
    h('div', { class: 'tool-actions' }, h('span', { class: 'io-label' }, 'Convert to'), select),
    h('div', { class: 'io-box' },
      h('div', { class: 'io-label-row' }, h('span', { class: 'io-label' }, 'Result'), copyBtn(() => output.value)),
      output,
    ),
  );
  input.focus();
}

function counterMount(body) {
  const input = h('textarea', { class: 'io-textarea tall', placeholder: 'Paste or type text…', spellcheck: 'false' });
  const stats = h('div', { class: 'stat-grid' });
  const stat = (label) => { const v = h('div', { class: 'stat-value' }, '0'); stats.append(h('div', { class: 'stat' }, v, h('div', { class: 'stat-label' }, label))); return v; };
  const sChars = stat('Characters'), sWords = stat('Words'), sLines = stat('Lines'), sSent = stat('Sentences'), sBytes = stat('Bytes (UTF-8)');
  const run = () => {
    const t = input.value;
    sChars.textContent = t.length.toLocaleString();
    sWords.textContent = (t.trim() ? t.trim().split(/\s+/).length : 0).toLocaleString();
    sLines.textContent = (t ? t.split(/\n/).length : 0).toLocaleString();
    sSent.textContent = (t.match(/[^.!?]+[.!?]+/g) || []).length.toLocaleString();
    sBytes.textContent = new TextEncoder().encode(t).length.toLocaleString();
  };
  input.addEventListener('input', run);
  body.append(h('div', { class: 'io-box' }, input), stats);
  input.focus();
}

const LOREM = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur'.split(' ');

function loremMount(body) {
  const count = h('input', { class: 'part-input', type: 'number', min: '1', max: '50', value: '3', style: 'max-width:5rem' });
  const output = h('textarea', { class: 'io-textarea tall', readonly: true, spellcheck: 'false' });
  const gen = () => {
    const n = Math.min(50, Math.max(1, +count.value || 1));
    const paras = [];
    for (let i = 0; i < n; i++) {
      const len = 30 + ((i * 17) % 40); // deterministic-ish variety
      const w = [];
      for (let j = 0; j < len; j++) w.push(LOREM[(i * 7 + j * 3) % LOREM.length]);
      let s = w.join(' ').replace(/(^|\.\s)([a-z])/g, (_, p, c) => p + c.toUpperCase());
      paras.push(s.charAt(0).toUpperCase() + s.slice(1) + '.');
    }
    output.value = paras.join('\n\n');
  };
  count.addEventListener('input', gen);
  body.append(
    h('div', { class: 'tool-actions' },
      h('span', { class: 'io-label' }, 'Paragraphs'), count,
      h('button', { class: 'btn btn-primary btn-sm', type: 'button', onClick: gen }, 'Generate'),
    ),
    h('div', { class: 'io-box' },
      h('div', { class: 'io-label-row' }, h('span', { class: 'io-label' }, 'Output'), copyBtn(() => output.value)),
      output,
    ),
  );
  gen();
}

export default [
  { id: 'text-case', category: 'Text', name: 'Case Converter', title: 'Case Converter', desc: 'Convert text between UPPER, lower, Title, camelCase, snake_case, kebab-case and more.', mount: caseMount },
  {
    id: 'text-slugify', category: 'Text', name: 'Slugify', title: 'Slugify',
    desc: 'Turn any text into a clean, URL-friendly slug.',
    mount: transformTool({
      live: true, placeholder: 'Hello, World! — My First Post',
      transform: (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
    }),
  },
  { id: 'text-count', category: 'Text', name: 'Word Counter', title: 'Word & Character Counter', desc: 'Live counts of characters, words, lines, sentences and UTF-8 bytes.', mount: counterMount },
  { id: 'text-lorem', category: 'Text', name: 'Lorem Ipsum', title: 'Lorem Ipsum Generator', desc: 'Generate placeholder paragraphs.', mount: loremMount },
];
