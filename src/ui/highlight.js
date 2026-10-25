import { h } from './dom.js';

/**
 * `text` as nodes, with the characters at `indices` wrapped in <mark> — the
 * letters a fuzzy search matched. Built from text nodes, never markup.
 */
export function highlightMatches(text, indices) {
  if (!indices?.length) return [text];
  const marked = new Set(indices);
  const parts = [];
  let run = '';
  let isMarkedRun = false;
  // Split by UTF-16 unit, the same unit the match indices count in.
  text.split('').forEach((char, index) => {
    if (marked.has(index) !== isMarkedRun && run) {
      parts.push(isMarkedRun ? h('mark', {}, run) : run);
      run = '';
    }
    isMarkedRun = marked.has(index);
    run += char;
  });
  if (run) parts.push(isMarkedRun ? h('mark', {}, run) : run);
  return parts;
}
