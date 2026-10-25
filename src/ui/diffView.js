// The git-style diff view shared by JSON Compare and Text Diff.

import { h } from './dom.js';
import { diffLines, diffSign } from '../lib/diff.js';

// Unchanged stretches longer than this fold away, keeping a few lines of
// context either side of each change, the way a code review shows a diff.
const CONTEXT_LINES = 3;
const MIN_FOLDED_LINES = 4;

function diffRow(row) {
  return h('div', { class: 'diff-line diff-' + row.type },
    h('span', { class: 'diff-num' }, row.oldLine ?? ''),
    h('span', { class: 'diff-num' }, row.newLine ?? ''),
    h('span', { class: 'diff-sign' }, diffSign[row.type]),
    h('span', { class: 'diff-text' }, row.text));
}

// Hidden rows are only built when the fold is opened, so a long unchanged
// file costs one button rather than thousands of rows.
function foldedRows(rows) {
  const fold = h('button', { class: 'diff-fold', type: 'button' },
    `⋯ Show ${rows.length.toLocaleString()} unchanged line${rows.length === 1 ? '' : 's'}`);
  fold.addEventListener('click', () => fold.replaceWith(...rows.map(diffRow)));
  return fold;
}

/** Rows for one run of unchanged lines, folded in the middle when it is long. */
function unchangedRun(rows, { isFirst, isLast }) {
  const keepBefore = isFirst ? 0 : CONTEXT_LINES;
  const keepAfter = isLast ? 0 : CONTEXT_LINES;
  const hidden = rows.slice(keepBefore, rows.length - keepAfter);
  if (hidden.length < MIN_FOLDED_LINES) return rows.map(diffRow);
  return [
    ...rows.slice(0, keepBefore).map(diffRow),
    foldedRows(hidden),
    ...rows.slice(rows.length - keepAfter).map(diffRow),
  ];
}

/**
 * An added/removed summary above one color-coded, numbered row per line.
 * Throws Error(message) when the inputs are too large to align.
 *
 * @param {string[]} fromLines
 * @param {string[]} toLines
 * @param {string} identicalNote  shown instead of counts when nothing changed
 * @param {Object} [options]
 * @param {(line:string)=>string} [options.normalize]  compare lines by this key
 */
export function diffView(fromLines, toLines, identicalNote, { normalize } = {}) {
  const rows = diffLines(fromLines, toLines, { normalize });
  const added = rows.filter((row) => row.type === 'add').length;
  const removed = rows.filter((row) => row.type === 'del').length;

  const summary = added || removed
    ? h('div', { class: 'diff-summary' },
        h('span', { class: 'diff-add-count' }, `+${added} added`),
        h('span', { class: 'diff-del-count' }, `−${removed} removed`))
    : h('div', { class: 'diff-summary' }, h('span', { class: 'diff-same-note' }, identicalNote));

  const view = h('div', { class: 'diff-view' });
  let start = 0;
  while (start < rows.length) {
    if (rows[start].type !== 'same') {
      view.append(diffRow(rows[start++]));
      continue;
    }
    let end = start;
    while (end < rows.length && rows[end].type === 'same') end++;
    view.append(...unchangedRun(rows.slice(start, end), { isFirst: start === 0, isLast: end === rows.length }));
    start = end;
  }
  return h('div', {}, summary, view);
}
