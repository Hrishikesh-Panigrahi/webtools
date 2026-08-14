// Line-based diff via longest common subsequence: which lines to keep, add, or
// remove. Returns rows of { type: 'same' | 'add' | 'del', text }.

// The LCS table costs one number per pair of lines, so a pair of large files
// would allocate gigabytes and hang the tab. Matching identical leading and
// trailing lines first shrinks that table to the region that actually differs —
// which is most of the win, since real edits share long unchanged stretches —
// and anything still too big is reported instead of attempted.
const MAX_TABLE_CELLS = 4_000_000;

export function diffLines(from, to) {
  let head = 0;
  while (head < from.length && head < to.length && from[head] === to[head]) head++;

  let tail = 0;
  while (
    tail < from.length - head &&
    tail < to.length - head &&
    from[from.length - 1 - tail] === to[to.length - 1 - tail]
  ) tail++;

  const changedFrom = from.slice(head, from.length - tail);
  const changedTo = to.slice(head, to.length - tail);
  if (changedFrom.length * changedTo.length > MAX_TABLE_CELLS) {
    throw new Error('Too many differing lines to diff. Try comparing smaller sections.');
  }

  const unchanged = (lines) => lines.map((text) => ({ type: 'same', text }));
  return [
    ...unchanged(from.slice(0, head)),
    ...alignChangedLines(changedFrom, changedTo),
    ...unchanged(from.slice(from.length - tail)),
  ];
}

function alignChangedLines(from, to) {
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

export const diffSign = { add: '+', del: '-', same: ' ' };
