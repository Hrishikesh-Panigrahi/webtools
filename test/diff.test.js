import test from 'node:test';
import assert from 'node:assert/strict';
import { diffLines } from '../src/lib/diff.js';

/** The rows that make up one side, so a diff is checked by what it implies. */
const sideRows = (rows, removedOrAdded) => rows.filter((row) => row.type === 'same' || row.type === removedOrAdded);
const numbered = (lines) => lines.map((_, index) => index + 1);

test('rows rebuild both inputs, with consecutive line numbers on each side', () => {
  const from = ['a', 'b', 'c', 'd', 'e'];
  const to = ['a', 'x', 'c', 'e', 'f'];
  const rows = diffLines(from, to);

  const oldRows = sideRows(rows, 'del');
  assert.deepEqual(oldRows.map((row) => row.text), from);
  assert.deepEqual(oldRows.map((row) => row.oldLine), numbered(from));

  const newRows = sideRows(rows, 'add');
  assert.deepEqual(newRows.map((row) => row.text), to);
  assert.deepEqual(newRows.map((row) => row.newLine), numbered(to));
});

test('added rows carry only a new line number, removed rows only an old one', () => {
  for (const row of diffLines(['a', 'b'], ['b', 'c'])) {
    if (row.type === 'add') assert.equal(row.oldLine, undefined);
    if (row.type === 'del') assert.equal(row.newLine, undefined);
  }
});

test('normalize compares by key but reports the original text', () => {
  const rows = diffLines(['  Hello', 'World'], ['hello  ', 'world'], { normalize: (line) => line.trim().toLowerCase() });
  assert.ok(rows.every((row) => row.type === 'same'));
  assert.deepEqual(rows.map((row) => row.text), ['hello  ', 'world']);
});

test('identical input produces only unchanged rows', () => {
  const lines = Array.from({ length: 1000 }, (_, index) => `line ${index}`);
  const rows = diffLines(lines, [...lines]);
  assert.equal(rows.length, 1000);
  assert.ok(rows.every((row) => row.type === 'same' && row.oldLine === row.newLine));
});

test('long files with scattered edits diff quickly and minimally', () => {
  const from = Array.from({ length: 10_000 }, (_, index) => `line ${index}`);
  const to = from.map((line, index) => (index % 97 === 0 ? `${line} changed` : line));
  to.splice(5000, 0, 'inserted');
  to.splice(200, 3);
  const started = performance.now();
  const rows = diffLines(from, to);
  assert.ok(performance.now() - started < 500, 'took too long');
  assert.deepEqual(sideRows(rows, 'del').map((row) => row.text), from);
  assert.deepEqual(sideRows(rows, 'add').map((row) => row.text), to);
  const changed = from.filter((_, index) => index % 97 === 0).length;
  // Each changed line is one removal and one addition; the splices add 1 and remove 3 more.
  assert.equal(rows.filter((row) => row.type === 'add').length, changed + 1 - countChangedIn(200, 203));
  assert.equal(rows.filter((row) => row.type === 'del').length, changed + 3 - countChangedIn(200, 203));
});

/** Changed lines that fall inside a removed range are not also "changed". */
function countChangedIn(start, end) {
  let count = 0;
  for (let index = start; index < end; index++) if (index % 97 === 0) count++;
  return count;
}

test('completely different inputs and empty sides', () => {
  assert.deepEqual(diffLines([], []), []);
  assert.deepEqual(diffLines([], ['a', 'b']).map((row) => row.type), ['add', 'add']);
  assert.deepEqual(diffLines(['a', 'b'], []).map((row) => row.type), ['del', 'del']);
  const rows = diffLines(['a', 'b', 'c'], ['x', 'y']);
  assert.equal(rows.filter((row) => row.type === 'del').length, 3);
  assert.equal(rows.filter((row) => row.type === 'add').length, 2);
});

test('inputs too large to align are refused rather than attempted', () => {
  const from = Array.from({ length: 3000 }, (_, index) => `a${index}`);
  const to = Array.from({ length: 3000 }, (_, index) => `b${index}`);
  assert.throws(() => diffLines(from, to), /Too many differing lines/);
});
