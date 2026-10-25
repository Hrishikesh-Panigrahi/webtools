// A textarea that behaves like a small code editor: line numbers that follow
// soft wrapping, a status bar with the caret position and size, a wrap toggle,
// Tab / Shift+Tab to indent, Enter that keeps indentation, and a marker on the
// line an error points at.
//
// It stays a real <textarea>, so the shell's persistence, file drop and
// accessible naming keep working on it unchanged.

import { h } from './dom.js';
import { formatBytes } from '../lib/format.js';
import { locate, countLines } from '../lib/text.js';

const INDENT = '  ';
const CLOSING_BRACKETS = { '{': '}', '[': ']', '(': ')' };
// Measuring wrapped rows costs one element per line and a layout of the whole
// text; past these sizes, wrap mode drops the numbers rather than stall the tab.
const MAX_MEASURED_LINES = 4000;
const MAX_MEASURED_CHARS = 200_000;

const nativeValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');

/**
 * Insert `text` over the current selection the way typing would, so the
 * browser's undo stack keeps working. `execCommand` is deprecated but remains
 * the only way to do that; `setRangeText` is the fallback.
 */
function insertText(textarea, text) {
  if (!document.execCommand('insertText', false, text)) {
    textarea.setRangeText(text, textarea.selectionStart, textarea.selectionEnd, 'end');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

// Tab at a caret inserts an indent; Tab over a selection, or Shift+Tab
// anywhere, re-indents every line the selection touches.
function indentSelection(textarea, outdent) {
  const { value, selectionStart: start, selectionEnd: end } = textarea;
  const hasSelection = start !== end;
  if (!outdent && !hasSelection) {
    insertText(textarea, INDENT);
    return;
  }
  const blockStart = value.lastIndexOf('\n', start - 1) + 1;
  const lines = value.slice(blockStart, end).split('\n');
  const changed = lines.map((line) => (outdent ? line.replace(/^(?: {1,2}|\t)/, '') : INDENT + line)).join('\n');
  textarea.setSelectionRange(blockStart, end);
  insertText(textarea, changed);
  const caret = Math.max(blockStart, start + changed.split('\n', 1)[0].length - lines[0].length);
  textarea.setSelectionRange(caret, hasSelection ? blockStart + changed.length : caret);
}

// Enter keeps the current line's indentation, and one level deeper after an
// opening bracket — splitting `{}` puts the caret on its own indented line.
function newlineWithIndent(textarea) {
  const { value, selectionStart: start, selectionEnd: end } = textarea;
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const indent = /^[ \t]*/.exec(value.slice(lineStart, start))[0];
  const before = value[start - 1];
  if (!CLOSING_BRACKETS[before]) {
    insertText(textarea, '\n' + indent);
    return;
  }
  const inner = '\n' + indent + INDENT;
  if (value[end] === CLOSING_BRACKETS[before]) {
    insertText(textarea, inner + '\n' + indent);
    textarea.setSelectionRange(start + inner.length, start + inner.length);
  } else {
    insertText(textarea, inner);
  }
}

/**
 * Turn `textarea` into a code editor.
 *
 * @param {HTMLTextAreaElement} textarea
 * @param {Object} [options]
 * @param {boolean} [options.wrap]  start with soft wrapping on
 * @returns {{ root: HTMLElement, textarea: HTMLTextAreaElement,
 *   markError(offset: number|null): void, reveal(offset: number): void }}
 */
export function codeEditor(textarea, { wrap = false } = {}) {
  textarea.classList.add('editor-input');
  const isReadOnly = textarea.readOnly;

  const gutterLines = h('div', { class: 'editor-gutter-lines' });
  const gutter = h('div', { class: 'editor-gutter', 'aria-hidden': 'true' }, gutterLines);
  const errorLine = h('div', { class: 'editor-error-line', hidden: true, 'aria-hidden': 'true' });
  const mirror = h('div', { class: 'editor-mirror', 'aria-hidden': 'true' });
  const surface = h('div', { class: 'editor-surface' }, errorLine, gutter, h('div', { class: 'editor-pane' }, mirror, textarea));

  const position = h('span', { class: 'editor-position' });
  const size = h('span', { class: 'editor-size' });
  const wrapToggle = h('input', { type: 'checkbox', checked: wrap });
  const status = h('div', { class: 'editor-status' },
    position,
    size,
    h('label', { class: 'editor-wrap', title: 'Soft-wrap long lines' }, wrapToggle, h('span', {}, 'Wrap')),
  );
  const root = h('div', { class: 'editor' + (isReadOnly ? ' is-readonly' : '') }, surface, status);

  // Visual rows per logical line. All 1 without wrapping; measured with it.
  let rowsPerLine = [];
  let errorLineNumber = null;
  let tabMovesFocus = false;
  let frame = 0;

  const lineHeight = () => Number.parseFloat(getComputedStyle(textarea).lineHeight) || 20;
  const isWrapping = () => wrapToggle.checked;

  function measureWrappedRows(text) {
    if (text.length > MAX_MEASURED_CHARS) return null;
    const lines = text.split('\n');
    if (lines.length > MAX_MEASURED_LINES) return null;
    mirror.style.width = `${textarea.clientWidth}px`;
    mirror.replaceChildren(...lines.map((line) => h('div', {}, line || '​')));
    const height = lineHeight();
    const rows = [...mirror.children].map((row) => Math.max(1, Math.round(row.offsetHeight / height)));
    mirror.replaceChildren();
    return rows;
  }

  function paintGutter() {
    const text = textarea.value;
    const lineCount = countLines(text);
    gutter.style.setProperty('--gutter-digits', String(Math.max(2, String(lineCount).length)));
    if (isWrapping()) {
      const measured = measureWrappedRows(text);
      gutter.classList.toggle('is-unnumbered', !measured);
      rowsPerLine = measured ?? [];
      // A wrapped line's continuation rows get blank gutter rows, so the gutter
      // stays one text node however long the document is.
      gutterLines.textContent = rowsPerLine.map((rows, index) => String(index + 1) + '\n'.repeat(rows - 1)).join('\n');
    } else {
      gutter.classList.remove('is-unnumbered');
      rowsPerLine = [];
      if (gutterLines.dataset.count !== String(lineCount)) {
        gutterLines.textContent = Array.from({ length: lineCount }, (_, index) => index + 1).join('\n');
      }
    }
    gutterLines.dataset.count = isWrapping() ? '' : String(lineCount);
    size.textContent = `${lineCount.toLocaleString()} ${lineCount === 1 ? 'line' : 'lines'} · ${formatBytes(new Blob([text]).size)}`;
  }

  const rowsBefore = (line) => (rowsPerLine.length
    ? rowsPerLine.slice(0, line - 1).reduce((sum, rows) => sum + rows, 0)
    : line - 1);

  function syncScroll() {
    gutterLines.style.transform = `translateY(${-textarea.scrollTop}px)`;
    if (errorLineNumber === null) return;
    const height = lineHeight();
    const top = Number.parseFloat(getComputedStyle(textarea).paddingTop) + rowsBefore(errorLineNumber) * height - textarea.scrollTop;
    errorLine.style.top = `${top}px`;
    errorLine.style.height = `${(rowsPerLine[errorLineNumber - 1] ?? 1) * height}px`;
  }

  function paintPosition() {
    const { selectionStart, selectionEnd, value } = textarea;
    const { line, column } = locate(value, selectionStart);
    const selected = selectionEnd - selectionStart;
    position.textContent = `Ln ${line}, Col ${column}${selected ? ` · ${selected.toLocaleString()} selected` : ''}`;
  }

  function refresh() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      paintGutter();
      paintPosition();
      syncScroll();
    });
  }

  // Tools assign `.value` directly when they compute output, which fires no
  // event. Hooking the setter on this one element keeps the gutter in step
  // without every tool having to remember to call refresh().
  Object.defineProperty(textarea, 'value', {
    configurable: true,
    get() { return nativeValue.get.call(this); },
    set(text) {
      nativeValue.set.call(this, text);
      errorLineNumber = null;
      errorLine.hidden = true;
      refresh();
    },
  });

  function applyWrap() {
    textarea.setAttribute('wrap', isWrapping() ? 'soft' : 'off');
    root.classList.toggle('is-wrapping', isWrapping());
    gutterLines.dataset.count = '';
    refresh();
  }

  textarea.addEventListener('input', refresh);
  textarea.addEventListener('scroll', syncScroll);
  for (const type of ['keyup', 'mouseup', 'select', 'focus', 'selectionchange']) textarea.addEventListener(type, paintPosition);
  wrapToggle.addEventListener('change', applyWrap);
  new ResizeObserver(() => { if (isWrapping()) refresh(); else syncScroll(); }).observe(textarea);

  if (!isReadOnly) {
    textarea.addEventListener('keydown', (event) => {
      const hasModifier = event.ctrlKey || event.metaKey || event.altKey;
      if (event.key === 'Escape') { tabMovesFocus = true; return; }
      if (event.key === 'Tab' && !hasModifier && !tabMovesFocus) {
        event.preventDefault();
        indentSelection(textarea, event.shiftKey);
        return;
      }
      if (event.key !== 'Tab') tabMovesFocus = false;
      if (event.key === 'Enter' && !hasModifier && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        newlineWithIndent(textarea);
      }
    });
    textarea.addEventListener('blur', () => { tabMovesFocus = false; });
  }

  applyWrap();

  return {
    root,
    textarea,
    /** Highlight the line holding `offset`, or clear the highlight with null. */
    markError(offset) {
      // Clearing a marker that isn't there must not touch layout: syncScroll
      // reads scrollTop, which forces a synchronous layout of the whole text.
      if (offset === null && errorLineNumber === null) return;
      errorLineNumber = offset === null ? null : locate(textarea.value, offset).line;
      errorLine.hidden = offset === null;
      syncScroll();
    },
    /** Put the caret at `offset` and scroll it into view. */
    reveal(offset) {
      const { line } = locate(textarea.value, offset);
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(offset, offset);
      textarea.scrollTop = Math.max(0, rowsBefore(line) * lineHeight() - textarea.clientHeight / 3);
      root.scrollIntoView({ block: 'nearest' });
      paintPosition();
      syncScroll();
    },
  };
}
