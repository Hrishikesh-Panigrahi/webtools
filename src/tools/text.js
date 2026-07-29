import { h, copyBtn } from '../dom.js';
import { transformTool, ioBox, diffView, toggleRow } from '../panel.js';

// Split on separators *and* on case boundaries, so an identifier already in one
// convention converts to another: `parseHTTPResponse` -> parse_http_response.
const words = (s) => s
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
  .trim()
  .split(/[\s_-]+/)
  .filter(Boolean);

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

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function regexMount(body) {
  const pattern = h('input', { class: 'url-field', spellcheck: 'false', placeholder: '\\b\\w+@\\w+\\.\\w+\\b' });
  const flags = h('input', { class: 'part-input', spellcheck: 'false', placeholder: 'gi', style: 'max-width:6rem' });
  const test = h('textarea', { class: 'io-textarea', placeholder: 'Text to match against…', spellcheck: 'false' });
  const error = h('div', { class: 'io-error' });
  const info = h('div', { class: 'rx-info' });
  const highlight = h('div', { class: 'rx-highlight' });

  const run = () => {
    error.textContent = '';
    info.textContent = '';
    if (!pattern.value) { highlight.textContent = test.value; return; }
    let re;
    try {
      const flagStr = flags.value.includes('g') ? flags.value : flags.value + 'g';
      re = new RegExp(pattern.value, flagStr);
    } catch (e) {
      error.textContent = e.message;
      highlight.textContent = test.value;
      return;
    }
    const text = test.value;
    let out = '', last = 0, count = 0, firstGroups = null, match;
    re.lastIndex = 0;
    while ((match = re.exec(text)) !== null) {
      out += escapeHtml(text.slice(last, match.index));
      // A zero-length match (e.g. `a*`) has nothing to highlight — counting it is
      // enough; an empty <mark> would just render as a stray sliver.
      if (match[0]) out += '<mark class="rx-hit">' + escapeHtml(match[0]) + '</mark>';
      last = match.index + match[0].length;
      count++;
      if (match.length > 1 && !firstGroups) firstGroups = match.slice(1);
      if (match.index === re.lastIndex) re.lastIndex++; // guard against zero-length matches
      if (count > 50000) break; // safety valve
    }
    out += escapeHtml(text.slice(last));
    highlight.innerHTML = out;
    info.textContent = `${count} ${count === 1 ? 'match' : 'matches'}`
      + (firstGroups ? ' · groups: ' + firstGroups.map((g, i) => `$${i + 1}=${g ?? ''}`).join(', ') : '');
  };

  [pattern, flags, test].forEach((el) => el.addEventListener('input', run));
  body.append(
    h('div', { class: 'io-box' },
      h('div', { class: 'io-label' }, 'Pattern'),
      h('div', { class: 'rx-pattern-row' }, pattern, flags),
      error,
    ),
    h('div', { class: 'io-box' }, h('div', { class: 'io-label' }, 'Test text'), test),
    h('div', { class: 'io-label-row' }, h('span', { class: 'io-label' }, 'Matches'), info),
    highlight,
  );
  pattern.focus();
}

function diffMount(body) {
  const inputA = h('textarea', { class: 'io-textarea', placeholder: 'Original…', spellcheck: 'false' });
  const inputB = h('textarea', { class: 'io-textarea', placeholder: 'Changed…', spellcheck: 'false' });
  const error = h('div', { class: 'io-error' });
  const result = h('div', {});

  const run = () => {
    result.innerHTML = '';
    error.textContent = '';
    if (!inputA.value && !inputB.value) return;
    try {
      result.append(diffView(inputA.value.split('\n'), inputB.value.split('\n'), 'The two texts are identical.'));
    } catch (e) {
      error.textContent = e.message;
    }
  };

  inputA.addEventListener('input', run);
  inputB.addEventListener('input', run);
  body.append(
    h('div', { class: 'io-grid' }, ioBox('Original', inputA), ioBox('Changed', inputB)),
    error,
    result,
  );
  inputA.focus();
}

const LINE_ORDERS = {
  'Original order': null,
  'A → Z': (a, b) => a.localeCompare(b),
  'Z → A': (a, b) => b.localeCompare(a),
  'Numeric': (a, b) => (Number.parseFloat(a) || 0) - (Number.parseFloat(b) || 0),
  'Shortest first': (a, b) => a.length - b.length,
  'Longest first': (a, b) => b.length - a.length,
};

const TRIM = 'Trim each line';
const DROP_BLANKS = 'Drop blank lines';
const DEDUPE = 'Remove duplicates';
const IGNORE_CASE = 'Ignore case';
const REVERSE = 'Reverse result';

function linesMount(body) {
  const input = h('textarea', { class: 'io-textarea tall', placeholder: 'One item per line…', spellcheck: 'false' });
  const output = h('textarea', { class: 'io-textarea tall', readonly: true, spellcheck: 'false' });
  const order = h('select', { class: 'select' }, ...Object.keys(LINE_ORDERS).map((label) => h('option', {}, label)));
  const { row: options, boxes } = toggleRow([TRIM, DROP_BLANKS, DEDUPE, IGNORE_CASE, REVERSE], [TRIM, DROP_BLANKS, DEDUPE]);
  const counts = h('div', { class: 'rx-info' });

  const run = () => {
    const original = input.value ? input.value.split('\n') : [];
    const key = (line) => (boxes[IGNORE_CASE].checked ? line.toLowerCase() : line);

    let lines = boxes[TRIM].checked ? original.map((line) => line.trim()) : [...original];
    if (boxes[DROP_BLANKS].checked) lines = lines.filter((line) => line.trim() !== '');
    if (boxes[DEDUPE].checked) {
      const seen = new Set();
      lines = lines.filter((line) => {
        const identity = key(line);
        if (seen.has(identity)) return false;
        seen.add(identity);
        return true;
      });
    }

    const compare = LINE_ORDERS[order.value];
    if (compare) {
      lines.sort(boxes[IGNORE_CASE].checked ? (a, b) => compare(key(a), key(b)) : compare);
    }
    if (boxes[REVERSE].checked) lines.reverse();

    output.value = lines.join('\n');
    const removed = original.length - lines.length;
    counts.textContent = original.length
      ? `${original.length.toLocaleString()} in · ${lines.length.toLocaleString()} out · ${removed.toLocaleString()} removed`
      : '';
  };

  input.addEventListener('input', run);
  order.addEventListener('change', run);
  Object.values(boxes).forEach((box) => box.addEventListener('change', run));

  body.append(
    h('div', { class: 'tool-actions' }, h('span', { class: 'io-label' }, 'Order'), order, options),
    h('div', { class: 'io-grid' },
      ioBox('Lines', input),
      h('div', { class: 'io-box' },
        h('div', { class: 'io-label-row' }, h('span', { class: 'io-label' }, 'Result'), copyBtn(() => output.value)),
        output,
        counts,
      ),
    ),
  );
  input.focus();
}

export default [
  { id: 'text-case', category: 'Text', name: 'Case Converter', title: 'Case Converter', desc: 'Convert text between UPPER, lower, Title, camelCase, snake_case, kebab-case and more.', mount: caseMount },
  { id: 'text-regex', category: 'Text', name: 'Regex Tester', title: 'Regex Tester', desc: 'Test a regular expression against sample text with live match highlighting and capture groups.', mount: regexMount },
  { id: 'text-diff', category: 'Text', name: 'Text Diff', title: 'Text Diff', desc: 'Line-by-line diff of two blocks of text. Green lines are added; red lines are removed.', mount: diffMount },
  {
    id: 'text-slugify', category: 'Text', name: 'Slugify', title: 'Slugify',
    desc: 'Turn any text into a clean, URL-friendly slug.',
    mount: transformTool({
      live: true, placeholder: 'Hello, World! — My First Post',
      transform: (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
    }),
  },
  {
    id: 'text-lines', category: 'Text', name: 'Sort & Dedupe', title: 'Line Sorter & Deduplicator',
    desc: 'Sort, trim and de-duplicate a list of lines — for cleaning up log output, ID lists and config blocks.',
    mount: linesMount,
  },
  { id: 'text-count', category: 'Text', name: 'Word Counter', title: 'Word & Character Counter', desc: 'Live counts of characters, words, lines, sentences and UTF-8 bytes.', mount: counterMount },
  { id: 'text-lorem', category: 'Text', name: 'Lorem Ipsum', title: 'Lorem Ipsum Generator', desc: 'Generate placeholder paragraphs.', mount: loremMount },
];
