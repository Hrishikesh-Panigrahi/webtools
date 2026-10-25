import { h, setField, onRunKey } from '../ui/dom.js';
import { icons } from '../ui/icons.js';
import { copyButton, copyText, downloadButton } from '../ui/buttons.js';
import { toast } from '../ui/toast.js';
import { transformTool, inputHeader, runOnInput } from '../ui/panel.js';
import { diffView } from '../ui/diffView.js';
import { errorNotice } from '../ui/notice.js';
import { codeEditor } from '../ui/editor.js';
import { parseJson, repairJson, formatJson, formattedLineCount, isInlineArray, childPath, measureJson } from '../lib/json.js';
import { formatBytes } from '../lib/format.js';

const INDENTS = { '2 spaces': '  ', '4 spaces': '    ', 'Tab': '\t' };

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

/** Show a failed parse on `notice`, offering Repair when relaxed parsing can fix it. */
function reportParseError(notice, field, error) {
  const repaired = repairJson(field.value);
  notice.show(error, { repair: repaired == null ? null : () => setField(field, repaired) });
}

const plural = (count, noun) => `${count.toLocaleString()} ${noun}${count === 1 ? '' : 's'}`;

function describeShape(value) {
  const { keys, items, depth } = measureJson(value);
  return [plural(keys, 'key'), plural(items, 'item'), `depth ${depth}`].join(' · ');
}

function validateMount(body) {
  const input = h('textarea', { class: 'io-textarea tall', placeholder: '{"valid": true, "tags": ["a", "b"]}', spellcheck: 'false' });
  const editor = codeEditor(input);
  const notice = errorNotice(editor);
  const verdict = h('div', { class: 'validate-msg' });
  const result = h('div', { class: 'validate-result ok' },
    h('span', { class: 'validate-icon' }, '✓'),
    h('div', {}, h('div', { class: 'validate-title' }, 'Valid JSON'), verdict),
  );

  const run = () => {
    result.classList.remove('show');
    if (!input.value.trim()) { notice.clear(); return; }
    try {
      const value = parseJson(input.value);
      notice.clear();
      verdict.textContent = describeShape(value);
      result.classList.add('show');
    } catch (error) {
      reportParseError(notice, input, error);
    }
  };

  runOnInput([input], run);
  body.append(h('div', { class: 'io-box' }, inputHeader('JSON', input), editor.root, notice.root), result);
  input.focus();
}

function compareMount(body) {
  const inputA = h('textarea', { class: 'io-textarea', placeholder: '{"name":"Alice","age":30,"tags":["admin"]}', spellcheck: 'false' });
  const inputB = h('textarea', { class: 'io-textarea', placeholder: '{"age":31,"name":"Alice","tags":["admin","dev"]}', spellcheck: 'false' });
  const sides = [inputA, inputB].map((input) => {
    const editor = codeEditor(input);
    return { input, editor, notice: errorNotice(editor) };
  });
  const error = h('div', { class: 'io-error' });
  const result = h('div', {});

  const normalized = ({ input, notice }) => {
    if (!input.value.trim()) { notice.clear(); return null; }
    try {
      const text = formatJson(sortDeep(parseJson(input.value)));
      notice.clear();
      return text;
    } catch (e) {
      reportParseError(notice, input, e);
      return null;
    }
  };

  const compare = () => {
    error.textContent = '';
    result.replaceChildren();
    const [textA, textB] = sides.map(normalized);
    if (textA === null || textB === null) return;
    try {
      result.append(diffView(textA.split('\n'), textB.split('\n'), 'The two documents are identical.'));
    } catch (e) {
      error.textContent = e.message;
    }
  };

  const swap = h('button', {
    class: 'btn-copy', type: 'button', html: icons.swap + ' Swap', title: 'Swap A and B',
    onClick: () => {
      const previousA = inputA.value;
      setField(inputA, inputB.value);
      setField(inputB, previousA);
    },
  });

  runOnInput([inputA, inputB], compare);
  sides.forEach(({ input }) => onRunKey(input, compare));

  body.append(
    h('p', { class: 'tool-hint' }, 'Objects are compared by key, so key order never counts as a difference.'),
    h('div', { class: 'io-grid' },
      ...sides.map(({ input, editor, notice }, index) => h('div', { class: 'io-box' },
        inputHeader(index === 0 ? 'JSON A' : 'JSON B', input, index === 1 ? [swap] : []),
        editor.root,
        notice.root,
      )),
    ),
    error,
    result,
  );
  inputA.focus();
}

// ---------- Prettify: a numbered, foldable tree ----------

function primitiveSpan(value) {
  if (value === null) return h('span', { class: 'json-null' }, 'null');
  const type = typeof value;
  if (type === 'string') return h('span', { class: 'json-string' }, JSON.stringify(value));
  if (type === 'number') return h('span', { class: 'json-number' }, String(value));
  if (type === 'boolean') return h('span', { class: 'json-boolean' }, String(value));
  return h('span', {}, String(value));
}

const punct = (text) => h('span', { class: 'json-punct' }, text);

/**
 * Renders a parsed document as tree rows. Every row carries the line number it
 * has in `formatJson` output and the JSONPath of its value, and remembers the
 * value itself for "Copy value".
 *
 * `lazy` defers a branch's children until it is first opened and starts it
 * folded. Building every row up front costs seconds on a large document — a
 * half-megabyte export is tens of thousands of elements — so past a size
 * threshold the tree materialises only what the reader actually opens. The
 * line numbers still match, because each branch knows how many lines it spans.
 */
function createTreeRenderer({ lazy }) {
  const values = new WeakMap();

  const row = (line, path, value, gutter, ...content) => {
    const element = h('div', { class: 'json-line', 'data-line': line, 'data-path': path },
      h('span', { class: 'json-gutter' }, gutter ?? ''),
      ...content);
    values.set(element, value);
    return element;
  };

  function render(container, { key, value, isLast, line, path }) {
    const keyNode = key == null ? null : h('span', { class: 'json-key' }, `${JSON.stringify(key)}: `);
    const trailing = isLast ? null : punct(',');
    const isBranch = value !== null && typeof value === 'object';

    if (!isBranch) {
      container.append(row(line, path, value, null, keyNode, primitiveSpan(value), trailing));
      return;
    }

    const isArray = Array.isArray(value);
    const entries = isArray ? value.map((item, i) => [i, item]) : Object.entries(value);
    const [open, close] = isArray ? ['[', ']'] : ['{', '}'];

    if (entries.length === 0) {
      container.append(row(line, path, value, null, keyNode, punct(open + close), trailing));
      return;
    }

    if (isInlineArray(value)) {
      const inline = value.flatMap((item, i) => (i ? [punct(', '), primitiveSpan(item)] : [primitiveSpan(item)]));
      container.append(row(line, path, value, null, keyNode, punct('['), ...inline, punct(']'), trailing));
      return;
    }

    const count = plural(entries.length, isArray ? 'item' : 'key');
    const branch = row(line, path, value, h('span', { class: 'chevron', html: icons.chevron }),
      keyNode, punct(open), h('span', { class: 'json-summary' }, ` … ${count} ${close}${isLast ? '' : ','}`));
    branch.classList.add('json-branch');

    const children = h('div', { class: 'json-children' });
    const group = h('div', { class: 'json-group' }, branch, children,
      row(line + formattedLineCount(value) - 1, path, value, null, punct(close), trailing));
    group.lastChild.classList.add('json-close');

    let isBuilt = false;
    group.buildChildren = () => {
      if (isBuilt) return;
      isBuilt = true;
      let childLine = line + 1;
      entries.forEach(([childKey, childValue], i) => {
        render(children, {
          key: isArray ? null : childKey,
          value: childValue,
          isLast: i === entries.length - 1,
          line: childLine,
          path: childPath(path, childKey),
        });
        childLine += formattedLineCount(childValue);
      });
    };
    if (lazy) group.classList.add('collapsed'); else group.buildChildren();
    container.append(group);
  }

  return { render, valueOf: (element) => values.get(element) };
}

const isVisible = (line) => line.offsetParent !== null;

function prettifyMount(body) {
  // Past this much input, branches fold instead of rendering up front.
  const LAZY_CHAR_THRESHOLD = 200_000;
  const input = h('textarea', {
    class: 'io-textarea', spellcheck: 'false',
    placeholder: '{"id":7,"name":"Ada Lovelace","roles":["admin","dev"],"address":{"city":"London","zip":"N1 9GU"},"active":true,"manager":null}',
  });
  const editor = codeEditor(input);
  const notice = errorNotice(editor);
  const indentSelect = h('select', { class: 'select select-sm', 'aria-label': 'Indent' },
    ...Object.keys(INDENTS).map((label) => h('option', {}, label)));
  const tree = h('div', { class: 'json-tree', tabindex: '0', 'aria-label': 'Formatted JSON tree' });
  const pathLabel = h('code', { class: 'tree-path' });
  const shape = h('span', { class: 'tree-shape' });
  const foldNote = h('p', { class: 'tool-hint', hidden: true },
    'Large document, so branches start folded and build as you open them. Expand all still renders everything.');

  let parsed;
  let pretty = '';
  let renderer = null;
  let selected = null;

  const copyPath = h('button', {
    class: 'btn-copy', type: 'button', html: icons.copy + ' Path', title: 'Copy the JSONPath of the selected line', disabled: true,
    onClick: async () => { await copyText(selected.dataset.path); toast(`Copied ${selected.dataset.path}`); },
  });
  const copyValue = h('button', {
    class: 'btn-copy', type: 'button', html: icons.copy + ' Value', title: 'Copy the value of the selected line', disabled: true,
    onClick: async () => {
      const value = renderer.valueOf(selected);
      await copyText(typeof value === 'string' ? value : formatJson(value, INDENTS[indentSelect.value]));
      toast('Copied value');
    },
  });

  const select = (line) => {
    selected?.classList.remove('is-selected');
    selected = line;
    copyPath.disabled = copyValue.disabled = !line;
    if (!line) {
      pathLabel.textContent = 'Click a line to see its path';
      pathLabel.classList.add('is-empty');
      return;
    }
    line.classList.add('is-selected');
    line.scrollIntoView({ block: 'nearest' });
    pathLabel.textContent = line.dataset.path;
    pathLabel.classList.remove('is-empty');
  };

  const groupOf = (line) => line.closest('.json-group');
  const setGroupOpen = (group, isOpen) => {
    if (isOpen) group.buildChildren();
    group.classList.toggle('collapsed', !isOpen);
  };

  // Expanding a lazily-built tree reveals branches that do not exist yet, so
  // keep going until a pass stops turning up new ones.
  const setAllCollapsed = (collapsed) => {
    if (collapsed) {
      tree.querySelectorAll('.json-group').forEach((group) => group.classList.add('collapsed'));
      if (selected && !isVisible(selected)) select(tree.querySelector('.json-line'));
      return;
    }
    let previousCount = -1;
    while (previousCount !== tree.querySelectorAll('.json-group').length) {
      const groups = [...tree.querySelectorAll('.json-group')];
      previousCount = groups.length;
      groups.forEach((group) => setGroupOpen(group, true));
    }
  };

  tree.addEventListener('click', (event) => {
    const line = event.target.closest('.json-line');
    if (!line) return;
    if (line.classList.contains('json-branch')) {
      const group = groupOf(line);
      setGroupOpen(group, group.classList.contains('collapsed'));
    }
    select(line);
  });

  // Arrow keys walk the visible rows; left and right fold and unfold, the way
  // a file tree does.
  tree.addEventListener('keydown', (event) => {
    const visible = [...tree.querySelectorAll('.json-line')].filter(isVisible);
    if (!visible.length) return;
    const index = visible.indexOf(selected);
    const isBranch = selected?.classList.contains('json-branch');
    const isOpen = isBranch && !groupOf(selected).classList.contains('collapsed');
    const moves = {
      ArrowDown: () => select(visible[Math.min(index + 1, visible.length - 1)]),
      ArrowUp: () => select(visible[Math.max(index - 1, 0)]),
      Home: () => select(visible[0]),
      End: () => select(visible.at(-1)),
      ArrowRight: () => { if (isBranch && !isOpen) setGroupOpen(groupOf(selected), true); },
      ArrowLeft: () => {
        if (isOpen) { setGroupOpen(groupOf(selected), false); return; }
        const parent = selected?.parentElement.closest('.json-group');
        if (parent) select(parent.firstChild);
      },
      Enter: () => { if (isBranch) setGroupOpen(groupOf(selected), !isOpen); },
    };
    if (!moves[event.key]) return;
    event.preventDefault();
    if (!selected) select(visible[0]);
    else moves[event.key]();
  });

  const showOutput = (text, value) => {
    pretty = text;
    parsed = value;
    shape.textContent = value === undefined ? '' : `${describeShape(value)} · ${formatBytes(new Blob([text]).size)} formatted`;
  };

  const run = () => {
    tree.replaceChildren();
    select(null);
    foldNote.hidden = true;
    if (!input.value.trim()) {
      notice.clear();
      showOutput('', undefined);
      return;
    }
    let value;
    try {
      value = parseJson(input.value);
    } catch (error) {
      reportParseError(notice, input, error);
      showOutput('', undefined);
      return;
    }
    notice.clear();
    showOutput(formatJson(value, INDENTS[indentSelect.value]), value);
    const lazy = input.value.length > LAZY_CHAR_THRESHOLD;
    renderer = createTreeRenderer({ lazy });
    tree.style.setProperty('--gutter-digits', String(Math.max(2, String(formattedLineCount(value)).length)));
    renderer.render(tree, { key: null, value, isLast: true, line: 1, path: '$' });
    foldNote.hidden = !lazy;
  };

  indentSelect.addEventListener('change', () => {
    if (parsed !== undefined) showOutput(formatJson(parsed, INDENTS[indentSelect.value]), parsed);
  });
  runOnInput([input], run);
  onRunKey(input, run);

  const controls = h('div', { class: 'io-actions' },
    indentSelect,
    h('button', { class: 'btn-copy', type: 'button', onClick: () => setAllCollapsed(false) }, 'Expand all'),
    h('button', { class: 'btn-copy', type: 'button', onClick: () => setAllCollapsed(true) }, 'Collapse all'),
    downloadButton(() => 'formatted.json', () => pretty),
    copyButton(() => pretty),
  );

  body.append(
    h('div', { class: 'io-grid json-split' },
      h('div', { class: 'io-box' }, inputHeader('Input', input), editor.root, notice.root),
      h('div', { class: 'io-box' },
        h('div', { class: 'io-label-row' }, h('span', { class: 'io-label' }, 'Formatted'), controls),
        h('div', { class: 'tree-frame' },
          tree,
          h('div', { class: 'tree-status' }, pathLabel, copyPath, copyValue, shape),
        ),
        foldNote,
      ),
    ),
    h('p', { class: 'tool-hint' }, 'Click a line for its JSONPath. In the tree, ↑ ↓ move, ← → fold and unfold.'),
  );
  select(null);
  input.focus();
}

export default [
  {
    id: 'json-prettify', category: 'JSON', name: 'Prettify', title: 'JSON Prettify',
    keywords: 'format beautify pretty print viewer tree indent',
    desc: 'Format JSON into a numbered, foldable tree. Click any line for its path; mistakes are pinpointed and often repairable.',
    mount: prettifyMount,
  },
  {
    id: 'json-minify', category: 'JSON', name: 'Minify', title: 'JSON Minify',
    keywords: 'compress compact uglify whitespace',
    desc: 'Strip all unnecessary whitespace to produce the smallest valid JSON.',
    mount: transformTool({
      placeholder: '{\n  "name": "Alice",\n  "age": 30\n}',
      wrapInput: false, downloadName: 'minified.json', repair: repairJson,
      transform: (s) => JSON.stringify(parseJson(s)),
    }),
  },
  {
    id: 'json-validate', category: 'JSON', name: 'Validate', title: 'JSON Validate',
    keywords: 'lint check syntax error',
    desc: 'Check whether your JSON is valid as you type, with the exact line and column of any mistake.',
    mount: validateMount,
  },
  {
    id: 'json-sort', category: 'JSON', name: 'Sort Keys', title: 'JSON Sort Keys',
    keywords: 'order alphabetical canonical normalize',
    desc: 'Recursively sort every object key alphabetically. Arrays keep their order.',
    mount: transformTool({
      placeholder: '{"b":2,"a":1,"c":{"z":1,"y":2}}',
      wrapInput: false, wrapOutput: false, downloadName: 'sorted.json', repair: repairJson,
      transform: (s) => formatJson(sortDeep(parseJson(s))),
    }),
  },
  {
    id: 'json-compare', category: 'JSON', name: 'Compare', title: 'JSON Compare',
    keywords: 'diff difference deep equal',
    desc: 'Deep-compare two JSON documents. Green lines are added in the second; red lines are removed from the first.',
    mount: compareMount,
  },
];
