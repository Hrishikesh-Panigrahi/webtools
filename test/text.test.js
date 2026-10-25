import test from 'node:test';
import assert from 'node:assert/strict';
import { locate, countLines, elide, positionedError } from '../src/lib/text.js';

test('locate counts lines and columns from 1', () => {
  assert.deepEqual(locate('abc', 0), { line: 1, column: 1 });
  assert.deepEqual(locate('a\nbc\n', 3), { line: 2, column: 2 });
  assert.deepEqual(locate('a\nbc\n', 5), { line: 3, column: 1 });
  assert.deepEqual(locate('', 0), { line: 1, column: 1 });
});

test('countLines treats empty text as one line and counts every break', () => {
  assert.equal(countLines(''), 1);
  assert.equal(countLines('a'), 1);
  assert.equal(countLines('a\n'), 2);
  assert.equal(countLines('\n'.repeat(99_999)), 100_000);
});

test('elide keeps short text, flattens whitespace and cuts long text', () => {
  assert.equal(elide('short'), 'short');
  assert.equal(elide('two\n\n lines'), 'two lines');
  const cut = elide('x'.repeat(5000), 32);
  assert.equal(cut.length, 32);
  assert.ok(cut.endsWith('…'));
});

test('positionedError carries the offset, line, column and hint', () => {
  const error = positionedError('Bad', 'ab\ncd', 4, 'Fix it');
  assert.equal(error.message, 'Bad');
  assert.deepEqual({ offset: error.offset, line: error.line, column: error.column, hint: error.hint }, { offset: 4, line: 2, column: 2, hint: 'Fix it' });
});
