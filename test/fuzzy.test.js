import test from 'node:test';
import assert from 'node:assert/strict';
import { fuzzyMatch, rankTools } from '../src/lib/fuzzy.js';

const tools = [
  { id: 'b64-encode', name: 'Base64 Encode', title: 'Base64 Encode', category: 'Encode', keywords: 'btoa' },
  { id: 'b64-decode', name: 'Base64 Decode', title: 'Base64 Decode', category: 'Encode', keywords: 'atob' },
  { id: 'json-types', name: 'JSON → TypeScript', title: 'JSON to TypeScript', category: 'Code', desc: 'Generate interfaces from a sample.' },
  { id: 'json-prettify', name: 'Prettify', title: 'JSON Prettify', category: 'JSON', keywords: 'format beautify' },
  { id: 'time-unix', name: 'Timestamp', title: 'Unix Timestamp Converter', category: 'Convert', keywords: 'epoch' },
];
const top = (query) => rankTools(query, tools)[0]?.tool.id;

test('fuzzyMatch finds in-order subsequences, case-insensitively', () => {
  assert.deepEqual(fuzzyMatch('b64d', 'Base64 Decode').indices, [0, 4, 5, 7]);
  assert.equal(fuzzyMatch('xyz', 'Base64 Decode'), null);
  assert.equal(fuzzyMatch('edoc', 'Decode'), null);
});

test('contiguous and word-start matches outrank scattered ones', () => {
  const prefix = fuzzyMatch('dec', 'Decode').score;
  const inner = fuzzyMatch('dec', 'Undecided').score;
  const scattered = fuzzyMatch('dec', 'Do every check').score;
  assert.ok(prefix > inner && inner > scattered);
});

test('a later word start beats an earlier mid-word hit', () => {
  assert.deepEqual(fuzzyMatch('jts', 'JSON to TypeScript').indices.map((index) => 'JSON to TypeScript'[index]), ['J', 't', 'S']);
});

test('rankTools puts the obvious tool first', () => {
  assert.equal(top('b64d'), 'b64-decode');
  assert.equal(top('base64 enc'), 'b64-encode');
  assert.equal(top('epoch'), 'time-unix');
  assert.equal(top('beautify'), 'json-prettify');
  assert.equal(top('interfaces'), 'json-types');
  assert.equal(top('atob'), 'b64-decode');
});

test('every term must match and an empty query keeps every tool', () => {
  assert.equal(rankTools('base64 nonsense', tools).length, 0);
  assert.equal(rankTools('  ', tools).length, tools.length);
});

test('name highlights point at the matched characters', () => {
  const [hit] = rankTools('pret', tools);
  assert.deepEqual(hit.nameIndices, [0, 1, 2, 3]);
});
