// An error banner under an input: the message with its line and column, a
// hint, and actions to jump to the spot or repair the input.

import { h } from './dom.js';
import { icons } from './icons.js';

// A new error waits for typing to settle before it appears, so a half-typed
// value doesn't flash red on every keystroke. One already showing updates at once.
const SETTLE_DELAY_MS = 350;

/**
 * @param {{ markError(offset: number|null): void, reveal(offset: number): void }} [editor]
 *   marks and reveals positioned errors (see codeEditor)
 */
export function errorNotice(editor) {
  const message = h('div', { class: 'notice-message' });
  const hint = h('div', { class: 'notice-hint' });
  const actions = h('div', { class: 'notice-actions' });
  const root = h('div', { class: 'notice notice-error', hidden: true, 'aria-live': 'polite' },
    h('span', { class: 'notice-icon', html: icons.alert }),
    h('div', { class: 'notice-body' }, message, hint),
    actions,
  );
  let settleTimer = 0;

  const render = (error, repair) => {
    const position = error.line ? `Line ${error.line}, column ${error.column} — ` : '';
    message.textContent = position + (error.message || String(error));
    hint.textContent = error.hint ?? '';
    hint.hidden = !error.hint;
    actions.replaceChildren();
    if (editor && error.offset != null) {
      editor.markError(error.offset);
      actions.append(h('button', { class: 'btn btn-sm', type: 'button', onClick: () => editor.reveal(error.offset) }, 'Go to error'));
    }
    if (repair) {
      actions.append(h('button', { class: 'btn btn-sm btn-primary', type: 'button', html: `${icons.wand} Repair`, onClick: repair }));
    }
    root.hidden = false;
  };

  return {
    root,
    /**
     * @param {Error & {line?: number, column?: number, offset?: number, hint?: string}} error
     * @param {{ repair?: (() => void) | null }} [options]  offers a Repair button
     */
    show(error, { repair } = {}) {
      clearTimeout(settleTimer);
      if (root.hidden) settleTimer = setTimeout(() => render(error, repair), SETTLE_DELAY_MS);
      else render(error, repair);
    },
    clear() {
      clearTimeout(settleTimer);
      root.hidden = true;
      editor?.markError(null);
    },
  };
}
