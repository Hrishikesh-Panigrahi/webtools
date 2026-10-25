// Line-based diff: which lines to keep, add, or remove. Returns rows of
// { type: 'same' | 'add' | 'del', text, oldLine, newLine }, line numbers
// 1-based and present only on the side(s) a row belongs to.
//
// Uses Myers' O(ND) algorithm, whose cost grows with the number of differing
// lines rather than with file size: two 10,000-line files with a dozen edits
// diff as fast as two short ones. A table-based LCS, by contrast, allocates a
// cell for every pair of lines and gave up on a pair of 3,000-line files.

// The search remembers one row of positions per edit; past this many edits the
// files are mostly unrelated and the memory is better not spent.
const MAX_EDIT_DISTANCE = 3000;

/**
 * @param {string[]} from
 * @param {string[]} to
 * @param {Object} [options]
 * @param {(line:string)=>string} [options.normalize]  compare lines by this key
 *   (e.g. trimmed or lowercased) while still reporting their original text
 */
export function diffLines(from, to, { normalize } = {}) {
  const fromKeys = normalize ? from.map(normalize) : from;
  const toKeys = normalize ? to.map(normalize) : to;

  // Matching leading and trailing lines need no search at all.
  let head = 0;
  while (head < from.length && head < to.length && fromKeys[head] === toKeys[head]) head++;
  let tail = 0;
  while (
    tail < from.length - head &&
    tail < to.length - head &&
    fromKeys[from.length - 1 - tail] === toKeys[to.length - 1 - tail]
  ) tail++;

  const steps = [];
  for (let offset = 0; offset < head; offset++) steps.push(['same', offset, offset]);
  const middle = shortestEditSteps(fromKeys.slice(head, from.length - tail), toKeys.slice(head, to.length - tail));
  for (const [type, fromIndex, toIndex] of middle) steps.push([type, head + fromIndex, head + toIndex]);
  for (let offset = tail; offset > 0; offset--) steps.push(['same', from.length - offset, to.length - offset]);

  return steps.map(([type, fromIndex, toIndex]) => {
    if (type === 'del') return { type, text: from[fromIndex], oldLine: fromIndex + 1 };
    if (type === 'add') return { type, text: to[toIndex], newLine: toIndex + 1 };
    return { type, text: to[toIndex], oldLine: fromIndex + 1, newLine: toIndex + 1 };
  });
}

/**
 * Myers' greedy search for the shortest edit script.
 *
 * Diagonal k holds the points where x - y = k. For each edit count d it records
 * how far along each diagonal a path of d edits can reach, sliding through runs
 * of equal lines for free. The first d whose path reaches the end is minimal;
 * the recorded rows are then walked backwards to recover the path.
 *
 * @returns {[type: string, fromIndex: number, toIndex: number][]}
 */
function shortestEditSteps(from, to) {
  const fromLength = from.length;
  const toLength = to.length;
  const maxEdits = fromLength + toLength;
  const center = maxEdits + 1;
  // furthestX[center + k]: the furthest x reached on diagonal k so far.
  const furthestX = new Int32Array(2 * maxEdits + 3);
  const history = [];

  for (let edits = 0; edits <= maxEdits; edits++) {
    if (edits > MAX_EDIT_DISTANCE) {
      throw new Error(`Too many differing lines to diff (over ${MAX_EDIT_DISTANCE.toLocaleString()}). Try comparing smaller sections.`);
    }
    // Only diagonals -edits-1 … edits+1 can be read on the way back.
    history.push(furthestX.slice(center - edits - 1, center + edits + 2));
    for (let diagonal = -edits; diagonal <= edits; diagonal += 2) {
      const isInsertion = diagonal === -edits
        || (diagonal !== edits && furthestX[center + diagonal - 1] < furthestX[center + diagonal + 1]);
      let x = isInsertion ? furthestX[center + diagonal + 1] : furthestX[center + diagonal - 1] + 1;
      let y = x - diagonal;
      while (x < fromLength && y < toLength && from[x] === to[y]) { x++; y++; }
      furthestX[center + diagonal] = x;
      if (x >= fromLength && y >= toLength) return walkBack(history, fromLength, toLength);
    }
  }
  return [];
}

function walkBack(history, fromLength, toLength) {
  const steps = [];
  let x = fromLength;
  let y = toLength;
  for (let edits = history.length - 1; edits >= 0; edits--) {
    const row = history[edits];
    const reached = (diagonal) => row[diagonal + edits + 1];
    const diagonal = x - y;
    const isInsertion = diagonal === -edits || (diagonal !== edits && reached(diagonal - 1) < reached(diagonal + 1));
    const previousDiagonal = isInsertion ? diagonal + 1 : diagonal - 1;
    const previousX = reached(previousDiagonal);
    const previousY = previousX - previousDiagonal;
    while (x > previousX && y > previousY) steps.push(['same', --x, --y]);
    if (edits > 0) steps.push(isInsertion ? ['add', x, --y] : ['del', --x, y]);
  }
  return steps.reverse();
}

export const diffSign = { add: '+', del: '-', same: ' ' };
