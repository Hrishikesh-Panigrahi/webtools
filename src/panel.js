// Reusable tool-panel layouts. Each returns a `mount(body)` function.
import { h, copyBtn, pasteBtn, downloadBtn, clearField, onRunKey, icons } from './dom.js';
import { encodeState } from './state.js';
import { diffLines, diffSign } from './diff.js';
import { formatBytes } from './format.js';

/**
 * The most common shape: one input textarea -> one output textarea via `transform`.
 * `transform(text)` returns a string, or throws Error(message) to show an error.
 *
 * @param {Object} opts
 * @param {string} [opts.actionLabel]  primary button label
 * @param {string} [opts.placeholder]  input placeholder
 * @param {string} [opts.inputLabel]
 * @param {string} [opts.outputLabel]
 * @param {boolean} [opts.live]        run on every keystroke (no button)
 * @param {string} [opts.downloadName] filename for the output download button
 * @param {string} [opts.pipeTo]       tool id to send the output to (adds a swap button)
 * @param {string} [opts.pipeLabel]    label for that swap button
 * @param {(s:string)=>string} opts.transform
 */
export function transformTool(opts) {
  const {
    actionLabel = 'Run',
    placeholder = '',
    inputLabel = 'Input',
    outputLabel = 'Output',
    live = false,
    downloadName = 'output.txt',
    pipeTo,
    pipeLabel = 'Send',
    transform,
  } = opts;

  return (body) => {
    const input = h('textarea', { class: 'io-textarea', placeholder, spellcheck: 'false' });
    const output = h('textarea', { class: 'io-textarea', readonly: true, spellcheck: 'false' });
    const error = h('div', { class: 'io-error' });

    const run = () => {
      error.textContent = '';
      const val = input.value;
      if (!val.trim()) { output.value = ''; return; }
      try {
        output.value = transform(val);
      } catch (e) {
        output.value = '';
        error.textContent = e.message || String(e);
      }
    };

    // Paste replaces the input and re-runs; the input event keeps state in sync.
    const setInput = (text) => {
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      run();
    };

    const inBox = h('div', { class: 'io-box' },
      h('div', { class: 'io-label-row' },
        h('span', { class: 'io-label' }, inputLabel),
        pasteBtn(setInput),
      ),
      input,
      error,
    );

    const outActions = h('div', { class: 'io-actions' });
    if (pipeTo) {
      outActions.append(h('button', {
        class: 'btn-copy', type: 'button', html: icons.swap + ' ' + pipeLabel, title: 'Send output to ' + pipeTo,
        onClick: () => { location.hash = pipeTo + '?' + encodeState([output.value]); },
      }));
    }
    outActions.append(
      downloadBtn(() => downloadName, () => output.value),
      copyBtn(() => output.value),
    );
    const outBox = h('div', { class: 'io-box' },
      h('div', { class: 'io-label-row' },
        h('span', { class: 'io-label' }, outputLabel),
        outActions,
      ),
      output,
    );

    body.append(h('div', { class: 'io-grid' }, inBox, outBox));

    if (live) {
      input.addEventListener('input', run);
    } else {
      onRunKey(input, run);
      body.append(h('div', { class: 'tool-actions' },
        h('button', { class: 'btn btn-primary', type: 'button', onClick: run }, actionLabel),
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => { clearField(input); output.value = ''; error.textContent = ''; input.focus(); } }, 'Clear'),
        h('span', { class: 'kbd-hint' }, '⌘↵ / Ctrl+↵ to run'),
      ));
    }
    input.focus();
  };
}

/** A labelled block: label row (with optional copy) + a control/output element. */
export function ioBox(label, node, { copy } = {}) {
  const head = copy
    ? h('div', { class: 'io-label-row' }, h('span', { class: 'io-label' }, label), copyBtn(copy))
    : h('div', { class: 'io-label' }, label);
  return h('div', { class: 'io-box' }, head, node);
}

/**
 * The git-style diff view shared by JSON Compare and Text Diff: an added/removed
 * summary above one colour-coded row per line.
 * Throws Error(message) when the inputs are too large to align.
 */
export function diffView(fromLines, toLines, identicalNote) {
  const rows = diffLines(fromLines, toLines);
  const added = rows.filter((row) => row.type === 'add').length;
  const removed = rows.filter((row) => row.type === 'del').length;

  const summary = added || removed
    ? h('div', { class: 'diff-summary' },
        h('span', { class: 'diff-add-count' }, `+${added} added`),
        h('span', { class: 'diff-del-count' }, `−${removed} removed`))
    : h('div', { class: 'diff-summary' }, h('span', { class: 'diff-same-note' }, identicalNote));

  const view = h('div', { class: 'diff-view' });
  for (const row of rows) {
    view.append(h('div', { class: 'diff-line diff-' + row.type },
      h('span', { class: 'diff-sign' }, diffSign[row.type]),
      h('span', { class: 'diff-text' }, row.text)));
  }
  return h('div', {}, summary, view);
}

/** A row of checkbox options; returns the row plus the boxes keyed by label. */
export function toggleRow(labels, checkedByDefault = []) {
  const boxes = {};
  const row = h('div', { class: 'toggle-row' });
  for (const label of labels) {
    const box = h('input', { type: 'checkbox', ...(checkedByDefault.includes(label) ? { checked: true } : {}) });
    boxes[label] = box;
    row.append(h('label', { class: 'toggle' }, box, h('span', {}, label)));
  }
  return { row, boxes };
}

/**
 * A drop-or-click file zone for the tools that read binary files. The chosen
 * file's name and size replace the hint once something is loaded.
 *
 * @param {Object} opts
 * @param {string} [opts.accept]  an accept attribute, e.g. 'image/*'
 * @param {string} [opts.hint]    the idle prompt
 * @param {(file:File)=>void} opts.onFile
 */
export function filePicker({ accept = '', hint = 'Drop a file here, or click to choose', onFile }) {
  const input = h('input', { type: 'file', accept, hidden: true });
  const status = h('span', { class: 'dropzone-status' });
  const zone = h('label', { class: 'dropzone', tabindex: '0' },
    input,
    h('span', { class: 'dropzone-hint' }, hint),
    status,
  );

  const load = (file) => {
    if (!file) return;
    status.textContent = `${file.name} · ${formatBytes(file.size)}`;
    onFile(file);
  };

  input.addEventListener('change', () => load(input.files[0]));
  zone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); input.click(); }
  });
  zone.addEventListener('dragover', (event) => { event.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', (event) => {
    event.preventDefault();
    zone.classList.remove('dragover');
    load(event.dataTransfer.files[0]);
  });
  return zone;
}

/** A label + value row for read-only figures (costs, counts, next run times). */
export function keyValueRow(label, initial = '—') {
  const value = h('span', { class: 'kv-value' }, initial);
  return { row: h('div', { class: 'kv-row' }, h('span', { class: 'kv-label' }, label), value), value };
}
