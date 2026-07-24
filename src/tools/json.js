import { h, copyBtn, onRunKey, icons } from '../dom.js';
import { transformTool, ioBox } from '../panel.js';
import { diffLines, diffSign } from '../diff.js';

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

// One monospace row in the tree, with a fixed gutter so keys line up whether or
// not the row has a fold chevron.
function treeLine(gutter, ...content) {
  return h('div', { class: 'json-line' },
    h('span', { class: 'json-gutter' }, gutter || ''),
    ...content);
}

function primitiveSpan(value) {
  if (value === null) return h('span', { class: 'json-null' }, 'null');
  const type = typeof value;
  if (type === 'string') return h('span', { class: 'json-string' }, JSON.stringify(value));
  if (type === 'number') return h('span', { class: 'json-number' }, String(value));
  if (type === 'boolean') return h('span', { class: 'json-boolean' }, String(value));
  return h('span', {}, String(value));
}

// Recursively render `value` into `container`. Objects and arrays become
// collapsible groups; primitives become a single line. `key` is null for array
// items and top-level values.
function renderValue(container, key, value, isLast) {
  const keyNode = key == null ? null : h('span', { class: 'json-key' }, `${JSON.stringify(key)}: `);
  const trailing = isLast ? null : h('span', { class: 'json-punct' }, ',');
  const isBranch = value !== null && typeof value === 'object';

  if (!isBranch) {
    container.append(treeLine(null, keyNode, primitiveSpan(value), trailing));
    return;
  }

  const isArray = Array.isArray(value);
  const entries = isArray ? value.map((item, i) => [i, item]) : Object.entries(value);
  const open = isArray ? '[' : '{';
  const close = isArray ? ']' : '}';

  if (entries.length === 0) {
    container.append(treeLine(null, keyNode, h('span', { class: 'json-punct' }, open + close), trailing));
    return;
  }

  // Arrays of only primitives stay on one line, matching a hand-formatted document.
  if (isArray && value.every((item) => item === null || typeof item !== 'object')) {
    const inline = [h('span', { class: 'json-punct' }, '[')];
    value.forEach((item, i) => {
      inline.push(primitiveSpan(item));
      if (i < value.length - 1) inline.push(h('span', { class: 'json-punct' }, ', '));
    });
    inline.push(h('span', { class: 'json-punct' }, ']'));
    container.append(treeLine(null, keyNode, ...inline, trailing));
    return;
  }

  const noun = isArray ? 'item' : 'key';
  const count = `${entries.length} ${noun}${entries.length === 1 ? '' : 's'}`;
  const summary = h('span', { class: 'json-summary' }, `${open} … ${count} ${close}`);
  const chevron = h('span', { class: 'chevron', html: icons.chevron });

  const group = h('div', { class: 'json-group' });
  const branch = treeLine(chevron, keyNode, h('span', { class: 'json-punct' }, open), summary);
  branch.classList.add('json-branch');
  branch.addEventListener('click', () => group.classList.toggle('collapsed'));

  const children = h('div', { class: 'json-children' });
  entries.forEach(([childKey, childValue], i) => {
    renderValue(children, isArray ? null : childKey, childValue, i === entries.length - 1);
  });

  const closeLine = treeLine(null, h('span', { class: 'json-punct' }, close), trailing);
  closeLine.classList.add('json-close');

  group.append(branch, children, closeLine);
  container.append(group);
}

// Prettify renders an interactive collapsible tree (not a textarea) and widens
// the panel to full width when the document is large.
function prettifyMount(body) {
  const WIDE_LINE_THRESHOLD = 40;
  const input = h('textarea', { class: 'io-textarea', placeholder: '{"name":"Alice","age":30}', spellcheck: 'false' });
  const error = h('div', { class: 'io-error' });
  const tree = h('div', { class: 'json-tree' });
  let pretty = '';

  const panel = () => body.closest('.tool-panel');
  const isWide = () => panel()?.classList.contains('wide') ?? false;
  const setWide = (wide) => {
    panel()?.classList.toggle('wide', wide);
    widthBtn.textContent = wide ? 'Collapse width' : 'Expand width';
    widthBtn.setAttribute('aria-pressed', String(wide));
  };
  const setAllCollapsed = (collapsed) => {
    tree.querySelectorAll('.json-group').forEach((group) => group.classList.toggle('collapsed', collapsed));
  };

  const widthBtn = h('button', { class: 'btn btn-sm', type: 'button', onClick: () => setWide(!isWide()) }, 'Expand width');
  const controls = h('div', { class: 'json-controls' },
    h('button', { class: 'btn btn-sm', type: 'button', onClick: () => setAllCollapsed(false) }, 'Expand all'),
    h('button', { class: 'btn btn-sm', type: 'button', onClick: () => setAllCollapsed(true) }, 'Collapse all'),
    widthBtn,
    copyBtn(() => pretty),
  );

  const run = () => {
    error.textContent = '';
    tree.innerHTML = '';
    if (!input.value.trim()) { setWide(false); return; }
    let parsed;
    try {
      parsed = JSON.parse(input.value);
    } catch (e) {
      setWide(false);
      error.textContent = e.message;
      return;
    }
    pretty = JSON.stringify(parsed, null, 2);
    renderValue(tree, null, parsed, true);
    setWide(pretty.split('\n').length > WIDE_LINE_THRESHOLD);
  };

  setWide(false);
  onRunKey(input, run);

  body.append(
    h('div', { class: 'io-grid json-split' },
      h('div', { class: 'io-box' }, h('div', { class: 'io-label' }, 'Input'), input, error),
      h('div', { class: 'io-box' },
        h('div', { class: 'io-label-row' }, h('span', { class: 'io-label' }, 'Output'), controls),
        tree,
      ),
    ),
    h('div', { class: 'tool-actions' },
      h('button', { class: 'btn btn-primary', type: 'button', onClick: run }, 'Prettify'),
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => { input.value = ''; error.textContent = ''; tree.innerHTML = ''; setWide(false); input.focus(); } }, 'Clear'),
      h('span', { class: 'kbd-hint' }, '⌘↵ / Ctrl+↵ to run'),
    ),
  );
  input.focus();
}

export default [
  {
    id: 'json-prettify', category: 'JSON', name: 'Prettify', title: 'JSON Prettify',
    desc: 'Format JSON into a collapsible tree. Fold any key, and large documents expand to full width.',
    mount: prettifyMount,
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
