// Reusable tool-panel layouts and the pieces they are built from.

import { h, setField, onRunKey } from './dom.js';
import { icons } from './icons.js';
import { copyButton, pasteButton, downloadButton, clearButton, exampleButton } from './buttons.js';
import { codeEditor } from './editor.js';
import { errorNotice } from './notice.js';
import { openTool } from '../navigation.js';
import { formatBytes } from '../lib/format.js';

// Past this size a re-run waits for typing to pause instead of chasing every
// keystroke; below it, output simply keeps up.
const LARGE_INPUT_CHARS = 50_000;
const LARGE_INPUT_DELAY_MS = 180;
// A textarea lays out every character it holds, which costs about a second
// per megabyte in Chrome. Past this, the output editor shows the start only.
const MAX_DISPLAYED_OUTPUT_CHARS = 300_000;

/** Run `run` whenever any of `fields` changes, debounced only for large input. */
export function runOnInput(fields, run) {
  let timer = 0;
  const schedule = () => {
    clearTimeout(timer);
    if (fields.some((field) => field.value.length > LARGE_INPUT_CHARS)) timer = setTimeout(run, LARGE_INPUT_DELAY_MS);
    else run();
  };
  fields.forEach((field) => field.addEventListener('input', schedule));
}

/** The label row over an input: its name, then Example / Paste / Clear. */
export function inputHeader(label, field, extraActions = []) {
  return h('div', { class: 'io-label-row' },
    typeof label === 'string' ? h('span', { class: 'io-label' }, label) : label,
    h('div', { class: 'io-actions' },
      ...extraActions,
      field.placeholder ? exampleButton(field) : null,
      pasteButton((text) => setField(field, text)),
      clearButton(field),
    ),
  );
}

/**
 * The most common shape: one input editor -> one output editor via `transform`,
 * re-run as you type.
 *
 * `transform(text)` returns a string, or throws an Error to show instead. An
 * error carrying `line`, `column` and `offset` (a JsonSyntaxError, say) marks
 * the line and offers to jump to it.
 *
 * @param {Object} options
 * @param {string} [options.placeholder]   input placeholder, also loaded by "Example"
 * @param {string} [options.inputLabel]
 * @param {string} [options.outputLabel]
 * @param {boolean} [options.wrapInput]    soft-wrap the input editor (default on)
 * @param {boolean} [options.wrapOutput]   soft-wrap the output editor (default on)
 * @param {string} [options.downloadName]  filename for the output download button
 * @param {string} [options.pipeTo]        tool id to send the output to (adds a swap button)
 * @param {string} [options.pipeLabel]     label for that swap button
 * @param {(text:string)=>string|null} [options.repair]  a fixed-up input for a failed run, or null
 * @param {(text:string)=>string} options.transform
 */
export function transformTool(options) {
  const {
    placeholder = '',
    inputLabel = 'Input',
    outputLabel = 'Output',
    wrapInput = true,
    wrapOutput = true,
    downloadName = 'output.txt',
    pipeTo,
    pipeLabel = 'Send',
    repair,
    transform,
  } = options;

  return (body) => {
    const input = h('textarea', { class: 'io-textarea', placeholder, spellcheck: 'false' });
    const output = h('textarea', { class: 'io-textarea', readonly: true, spellcheck: 'false' });
    const inputEditor = codeEditor(input, { wrap: wrapInput });
    const outputEditor = codeEditor(output, { wrap: wrapOutput });
    const notice = errorNotice(inputEditor);
    const truncationNote = h('p', { class: 'tool-hint', hidden: true });
    // The whole result, which Copy, Download and the pipe use even when the
    // editor only shows the start of it.
    let fullOutput = '';

    const showOutput = (text) => {
      fullOutput = text;
      const isTruncated = text.length > MAX_DISPLAYED_OUTPUT_CHARS;
      output.value = isTruncated ? text.slice(0, MAX_DISPLAYED_OUTPUT_CHARS) : text;
      truncationNote.hidden = !isTruncated;
      truncationNote.textContent = isTruncated
        ? `Showing the first ${MAX_DISPLAYED_OUTPUT_CHARS.toLocaleString()} of ${text.length.toLocaleString()} characters. Copy and Download include all of it.`
        : '';
    };

    const run = () => {
      const text = input.value;
      if (!text.trim()) {
        showOutput('');
        notice.clear();
        return;
      }
      try {
        showOutput(transform(text));
        notice.clear();
      } catch (error) {
        showOutput('');
        const repaired = repair?.(text);
        notice.show(error, { repair: repaired == null ? null : () => setField(input, repaired) });
      }
    };

    const outputActions = h('div', { class: 'io-actions' });
    if (pipeTo) {
      outputActions.append(h('button', {
        class: 'btn-copy', type: 'button', html: `${icons.swap} ${pipeLabel}`, title: `${pipeLabel} this output`,
        onClick: () => openTool(pipeTo, fullOutput),
      }));
    }
    outputActions.append(
      downloadButton(() => downloadName, () => fullOutput),
      copyButton(() => fullOutput),
    );

    body.append(h('div', { class: 'io-grid' },
      h('div', { class: 'io-box' }, inputHeader(inputLabel, input), inputEditor.root, notice.root),
      h('div', { class: 'io-box' },
        h('div', { class: 'io-label-row' }, h('span', { class: 'io-label' }, outputLabel), outputActions),
        outputEditor.root,
        truncationNote,
      ),
    ));

    runOnInput([input], run);
    onRunKey(input, run);
    input.focus();
  };
}

/** A row of checkbox options; returns the row plus the boxes keyed by label. */
export function toggleRow(labels, checkedByDefault = []) {
  const boxes = {};
  const row = h('div', { class: 'toggle-row' });
  for (const label of labels) {
    const box = h('input', { type: 'checkbox', checked: checkedByDefault.includes(label) });
    boxes[label] = box;
    row.append(h('label', { class: 'toggle' }, box, h('span', {}, label)));
  }
  return { row, boxes };
}

/**
 * A drop-or-click file zone for the tools that read binary files. The chosen
 * file's name and size replace the hint once something is loaded.
 *
 * @param {Object} options
 * @param {string} [options.accept]  an accept attribute, e.g. 'image/*'
 * @param {string} [options.hint]    the idle prompt
 * @param {(file:File)=>void} options.onFile
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
