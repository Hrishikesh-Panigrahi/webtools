import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateTokens, TOKEN_CLASSES } from '../src/lib/tokens.js';

test('empty text costs nothing', () => {
  assert.deepEqual(estimateTokens(''), { tokens: 0, breakdown: { words: 0, numbers: 0, symbols: 0, spacing: 0, ideographic: 0 } });
});

test('the breakdown covers every class and sums to the total', () => {
  const { tokens, breakdown } = estimateTokens('Hello, world! 12345 🚀 世界\n\n  getUserName();');
  assert.deepEqual(Object.keys(breakdown).sort(), Object.keys(TOKEN_CLASSES).sort());
  assert.equal(Object.values(breakdown).reduce((sum, count) => sum + count, 0), tokens);
});

test('English prose lands near four characters per token', () => {
  const prose = 'The quick brown fox jumps over the lazy dog while the cat watches from the window. '.repeat(50);
  const ratio = prose.length / estimateTokens(prose).tokens;
  assert.ok(ratio > 3.5 && ratio < 6, `ratio ${ratio}`);
});

test('camelCase and long words cost more than short ones', () => {
  assert.equal(estimateTokens('cat').tokens, 1);
  assert.ok(estimateTokens('getUserName').tokens >= 3);
  assert.ok(estimateTokens('internationalization').tokens > 1);
});

test('CJK costs more than one token per character', () => {
  assert.ok(estimateTokens('世界你好').tokens >= 4);
});

test('a megabyte estimates in well under a second', () => {
  const text = '{"id":1,"name":"User","email":"user@example.com","tags":["a","b"]}\n'.repeat(15_000);
  const started = performance.now();
  estimateTokens(text);
  assert.ok(performance.now() - started < 1000);
});
