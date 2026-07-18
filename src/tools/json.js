import { h, onRunKey } from '../dom.js';
import { transformTool, ioBox } from '../panel.js';

function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, k) => {
      acc[k] = sortDeep(value[k]);
      return acc;
    }, {});
  }
  return value;
}

// Validate is a little custom: pass/fail card instead of an output box.
function validateMount(body) {
  const input = h('textarea', { class: 'io-textarea', placeholder: '{"valid": true}', spellcheck: 'false' });
  const result = h('div', { class: 'validate-result' });

  const run = () => {
    const val = input.value.trim();
    if (!val) { result.className = 'validate-result'; result.innerHTML = ''; return; }
    try {
      JSON.parse(val);
      result.className = 'validate-result show ok';
      result.innerHTML = '<span class="validate-icon">✓</span><div><div class="validate-title">Valid JSON</div></div>';
    } catch (e) {
      result.className = 'validate-result show bad';
      result.innerHTML = `<span class="validate-icon">✕</span><div><div class="validate-title">Invalid JSON</div><div class="validate-msg"></div></div>`;
      result.querySelector('.validate-msg').textContent = e.message;
    }
  };

  input.addEventListener('input', run);
  body.append(
    h('div', { class: 'io-box' }, h('div', { class: 'io-label' }, 'JSON'), input),
    result,
  );
  input.focus();
}

// Line-based diff via longest common subsequence: which lines to keep, add, or remove.
function diffLines(from, to) {
  const n = from.length, m = to.length;
  const lcs = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = from[i] === to[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const rows = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (from[i] === to[j]) rows.push({ type: 'same', text: from[i++] }), j++;
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) rows.push({ type: 'del', text: from[i++] });
    else rows.push({ type: 'add', text: to[j++] });
  }
  while (i < n) rows.push({ type: 'del', text: from[i++] });
  while (j < m) rows.push({ type: 'add', text: to[j++] });
  return rows;
}

const diffSign = { add: '+', del: '-', same: ' ' };

function compareMount(body) {
  const inputA = h('textarea', { class: 'io-textarea', placeholder: '{"name":"Alice","age":30}', spellcheck: 'false' });
  const inputB = h('textarea', { class: 'io-textarea', placeholder: '{"name":"Alice","age":31}', spellcheck: 'false' });
  const error = h('div', { class: 'io-error' });
  const result = h('div', {});

  const normalize = (text, label) => {
    try {
      return JSON.stringify(sortDeep(JSON.parse(text)), null, 2);
    } catch (e) {
      throw new Error(`${label} — ${e.message}`);
    }
  };

  const compare = () => {
    error.textContent = '';
    result.innerHTML = '';
    if (!inputA.value.trim() || !inputB.value.trim()) return;

    let normalizedA, normalizedB;
    try {
      normalizedA = normalize(inputA.value, 'JSON A');
      normalizedB = normalize(inputB.value, 'JSON B');
    } catch (e) {
      error.textContent = e.message;
      return;
    }

    const rows = diffLines(normalizedA.split('\n'), normalizedB.split('\n'));
    const added = rows.filter((r) => r.type === 'add').length;
    const removed = rows.filter((r) => r.type === 'del').length;

    const summary = added || removed
      ? h('div', { class: 'diff-summary' },
          h('span', { class: 'diff-add-count' }, `+${added} added`),
          h('span', { class: 'diff-del-count' }, `−${removed} removed`))
      : h('div', { class: 'diff-summary' }, h('span', { class: 'diff-same-note' }, 'The two documents are identical.'));

    const view = h('div', { class: 'diff-view' });
    for (const row of rows) {
      view.append(h('div', { class: 'diff-line diff-' + row.type },
        h('span', { class: 'diff-sign' }, diffSign[row.type]),
        h('span', { class: 'diff-text' }, row.text)));
    }

    result.append(summary, view);
  };

  onRunKey(inputA, compare);
  onRunKey(inputB, compare);

  body.append(
    h('p', { class: 'tool-hint' }, 'Objects are compared by key, so key order never counts as a difference.'),
    h('div', { class: 'io-grid' }, ioBox('JSON A', inputA), ioBox('JSON B', inputB)),
    error,
    h('div', { class: 'tool-actions' },
      h('button', { class: 'btn btn-primary', type: 'button', onClick: compare }, 'Compare'),
      h('button', {
        class: 'btn btn-ghost', type: 'button',
        onClick: () => { inputA.value = ''; inputB.value = ''; result.innerHTML = ''; error.textContent = ''; inputA.focus(); },
      }, 'Clear'),
      h('span', { class: 'kbd-hint' }, '⌘↵ / Ctrl+↵ to compare'),
    ),
    result,
  );
  inputA.focus();
}

export default [
  {
    id: 'json-prettify', category: 'JSON', name: 'Prettify', title: 'JSON Prettify',
    desc: 'Format and indent JSON for readability. Key order is preserved.',
    mount: transformTool({
      actionLabel: 'Prettify', placeholder: '{"name":"Alice","age":30}',
      transform: (s) => JSON.stringify(JSON.parse(s), null, 2),
    }),
  },
  {
    id: 'json-minify', category: 'JSON', name: 'Minify', title: 'JSON Minify',
    desc: 'Strip all unnecessary whitespace to produce the smallest valid JSON.',
    mount: transformTool({
      actionLabel: 'Minify', placeholder: '{\n  "name": "Alice",\n  "age": 30\n}',
      transform: (s) => JSON.stringify(JSON.parse(s)),
    }),
  },
  {
    id: 'json-validate', category: 'JSON', name: 'Validate', title: 'JSON Validate',
    desc: 'Check whether your JSON is syntactically valid, live as you type.',
    mount: validateMount,
  },
  {
    id: 'json-sort', category: 'JSON', name: 'Sort Keys', title: 'JSON Sort Keys',
    desc: 'Recursively sort every object key alphabetically. Arrays keep their order.',
    mount: transformTool({
      actionLabel: 'Sort', placeholder: '{"b":2,"a":1,"c":{"z":1,"y":2}}',
      transform: (s) => JSON.stringify(sortDeep(JSON.parse(s)), null, 2),
    }),
  },
  {
    id: 'json-compare', category: 'JSON', name: 'Compare', title: 'JSON Compare',
    desc: 'Deep-compare two JSON documents. Green lines are added in the second; red lines are removed from the first.',
    mount: compareMount,
  },
];
