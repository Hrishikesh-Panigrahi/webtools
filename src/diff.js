// Line-based diff via longest common subsequence: which lines to keep, add, or
// remove. Returns rows of { type: 'same' | 'add' | 'del', text }.
export function diffLines(from, to) {
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
