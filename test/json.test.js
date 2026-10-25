import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseJson, isRepairable, repairJson, JsonSyntaxError,
  formatJson, formattedLineCount, isInlineArray, childPath, measureJson,
} from '../src/lib/json.js';

/** Parse strictly and return the error, failing the test if there is none. */
const failureOf = (text) => {
  try {
    parseJson(text);
  } catch (error) {
    assert.ok(error instanceof JsonSyntaxError, `expected a JsonSyntaxError, got ${error}`);
    return error;
  }
  assert.fail(`expected ${JSON.stringify(text)} to be rejected`);
};

const at = (text, line, column) => {
  const error = failureOf(text);
  assert.deepEqual({ line: error.line, column: error.column }, { line, column }, error.message);
  assert.equal(error.offset, text.split('\n').slice(0, line - 1).join('\n').length + (line > 1 ? 1 : 0) + column - 1);
  return error;
};

test('valid JSON parses exactly as JSON.parse does', () => {
  const samples = [
    '{"a":1,"b":[true,false,null],"c":{"d":"e\\n\\u00e9"}}',
    '[]', '{}', '0', '-0.5e-3', '"just a string"', 'null',
    '  {"nested": [[[[]]]]}  ',
    '{"__proto__": {"polluted": true}}',
  ];
  for (const sample of samples) assert.deepEqual(parseJson(sample), JSON.parse(sample));
});

test('a "__proto__" key becomes a property, never the prototype', () => {
  const value = parseJson("{'__proto__': {polluted: true}}", { relaxed: true });
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  assert.deepEqual(Object.keys(value), ['__proto__']);
  assert.equal({}.polluted, undefined);
});

test('errors point at the offending character', () => {
  at('{"a": 1,}', 1, 8);
  at('{\n  "a": 1\n  "b": 2\n}', 3, 3);
  at("{'a': 1}", 1, 2);
  at('{a: 1}', 1, 2);
  at('[1, 2, 3', 1, 9);
  at('{"a": 1} {"b": 2}', 1, 10);
  at('{"path": "C:\\Users"}', 1, 13);
});

test('the usual mistakes come with a hint', () => {
  const cases = {
    '{"a": 1,}': /trailing comma/i,
    '[1, 2,]': /trailing comma/i,
    "{'a': 1}": /double quotes/i,
    '{a: 1}': /double quotes/i,
    '{"a": True}': /lowercase/i,
    '{"a": undefined}': /not a JSON value/i,
    '// note\n{}': /comments/i,
    '{"a": 1 "b": 2}': /missing comma/i,
    '[1 2]': /missing comma/i,
    '{"a": [1, 2}': /closed with "}"/,
    '{"a": {"b": 1}': /never closed/,
    '{"a": 012}': /leading zero/i,
    '{"a": .5}': /digit before the decimal/i,
    '{"a": 1.}': /followed by digits/i,
    '{"a": 0x1F}': /hexadecimal/i,
    '{"a": "line\nbreak"}': /line break/i,
    '{"a": "x}': /line break|unterminated/i,
    '"unterminated': /unterminated/i,
    '{\u201Ca\u201D: 1}': /curly/i,
    '{"a": \u201Cb\u201D}': /curly/i,
    '\uFEFF{}': /byte-order mark/i,
    '[1,,2]': /empty item/i,
    '': /empty/i,
    '   ': /empty/i,
  };
  for (const [text, pattern] of Object.entries(cases)) {
    const error = failureOf(text);
    assert.match(`${error.message} ${error.hint ?? ''}`, pattern, `for ${JSON.stringify(text)}: ${error.message}`);
  }
});

test('messages never echo a long input back', () => {
  const longWord = 'x'.repeat(5000);
  const error = failureOf(`{"a": ${longWord}}`);
  assert.ok(error.message.length < 120, error.message);
});

test('relaxed mode repairs what people paste from JavaScript and Python', () => {
  const pasted = `{
    // a comment
    name: 'Ada',
    /* block */ "tags": ['a', "b",],
    active: True, manager: None,
    \u201Cquoted\u201D: 1,
  }`;
  assert.deepEqual(parseJson(pasted, { relaxed: true }), {
    name: 'Ada', tags: ['a', 'b'], active: true, manager: null, quoted: 1,
  });
  assert.equal(isRepairable(pasted), true);
});

test('repairJson returns formatted valid JSON, or null when it cannot', () => {
  const repaired = repairJson("{a: 'b', list: [1, 2,],}", '    ');
  assert.deepEqual(JSON.parse(repaired), { a: 'b', list: [1, 2] });
  assert.match(repaired, /^ {4}"a": "b",$/m);
  assert.equal(repairJson('{"a": '), null);
});

test('isRepairable is false for valid JSON and for text no mode can read', () => {
  assert.equal(isRepairable('{"a": 1}'), false);
  assert.equal(isRepairable('{"a": }'), false);
  assert.equal(isRepairable('not json at all'), false);
});

test('relaxed mode still rejects structural errors', () => {
  for (const text of ['{"a": 1', '[1 2]', '{"a" 1}', '{"a": NaN}']) {
    assert.throws(() => parseJson(text, { relaxed: true }), JsonSyntaxError, text);
  }
});

test('formatJson round-trips and keeps short plain arrays inline', () => {
  const value = {
    id: 1, tags: ['a', 'b'], empty: [], none: {}, nested: { list: [{ x: 1 }, { y: [1, 2] }] },
    long: Array.from({ length: 40 }, (_, index) => index),
  };
  const text = formatJson(value);
  assert.deepEqual(JSON.parse(text), value);
  assert.match(text, /"tags": \["a", "b"\]/);
  assert.match(text, /"empty": \[\]/);
  assert.ok(!/"long": \[0/.test(text), 'a long array should break onto lines');
  assert.deepEqual(JSON.parse(formatJson(value, '\t')), value);
  assert.match(formatJson(value, '\t'), /^\t"id": 1,$/m);
});

test('formattedLineCount matches the formatted text', () => {
  const samples = [
    1, 'x', null, [], {}, [1, 2, 3], [[1], [2]],
    { a: { b: { c: [1, { d: 2 }] } }, e: [] },
    Array.from({ length: 50 }, (_, index) => ({ index })),
    { long: Array.from({ length: 100 }, () => 'item') },
  ];
  for (const value of samples) {
    assert.equal(formattedLineCount(value), formatJson(value).split('\n').length, JSON.stringify(value).slice(0, 40));
  }
});

test('isInlineArray only takes short arrays of plain values', () => {
  assert.equal(isInlineArray([1, 'a', null, true]), true);
  assert.equal(isInlineArray([]), false);
  assert.equal(isInlineArray([{}]), false);
  assert.equal(isInlineArray(Array.from({ length: 100 }, () => 1)), false);
});

test('childPath uses dot notation only where it is valid', () => {
  assert.equal(childPath('$', 'users'), '$.users');
  assert.equal(childPath('$.users', 0), '$.users[0]');
  assert.equal(childPath('$', 'first name'), '$["first name"]');
  assert.equal(childPath('$', '2fa'), '$["2fa"]');
  assert.equal(childPath('$', 'a"b'), '$["a\\"b"]');
});

test('measureJson counts keys, items and depth', () => {
  assert.deepEqual(measureJson(5), { keys: 0, items: 0, depth: 0 });
  assert.deepEqual(measureJson({ a: [1, 2, { b: 3 }] }), { keys: 2, items: 3, depth: 3 });
});
