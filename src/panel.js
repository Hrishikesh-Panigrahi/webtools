// Reusable tool-panel layouts. Each returns a `mount(body)` function.
import { h, copyBtn, pasteBtn, downloadBtn, onRunKey, icons } from './dom.js';
import { encodeState } from './state.js';

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
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => { input.value = ''; output.value = ''; error.textContent = ''; input.focus(); } }, 'Clear'),
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
