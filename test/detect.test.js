import test from 'node:test';
import assert from 'node:assert/strict';
import { detectContent } from '../src/lib/detect.js';

const firstFor = (text) => detectContent(text)[0]?.id;
const idsFor = (text) => detectContent(text).map((suggestion) => suggestion.id);

test('recognises common developer snippets', () => {
  const cases = {
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJl': 'jwt-decode',
    'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2ln': 'jwt-decode',
    'curl -X POST https://api.example.com -d \'{"a":1}\'': 'curl-fetch',
    '{"name": "Ada", "tags": ["x"]}': 'json-prettify',
    '[1, 2, 3]': 'json-prettify',
    "{name: 'Ada',}": 'json-prettify',
    'https://example.com/path?q=1#top': 'url-parse',
    '1700000000': 'time-unix',
    '1700000000000': 'time-unix',
    '2024-03-01T12:30:00Z': 'time-unix',
    '*/15 9-17 * * mon-fri': 'cron-explain',
    '@daily': 'cron-explain',
    '#4f7cff': 'color-convert',
    'rgb(79, 124, 255)': 'color-convert',
    'hsl(226, 100%, 65%)': 'color-convert',
    '10.0.0.1/24': 'net-ip',
    '2001:db8::1/48': 'net-ip',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36': 'net-useragent',
    'aGVsbG8gd29ybGQsIGhvdyBhcmUgeW91Pw==': 'b64-decode',
    '&lt;div&gt;Tom &amp; Jerry&lt;/div&gt;': 'html-decode',
    'name%3DJohn%20Doe': 'url-decode',
    '# Title\n\nSome **bold** text': 'md-preview',
    'name,role\nAda,engineer\nLinus,maintainer': 'csv-json',
  };
  for (const [text, id] of Object.entries(cases)) assert.equal(firstFor(text), id, text);
});

test('broken JSON still goes to the JSON tools, labelled as such', () => {
  const [suggestion] = detectContent('{"a": 1,,}');
  assert.equal(suggestion.id, 'json-prettify');
  assert.match(suggestion.kind, /errors/);
  assert.match(detectContent("{a: 'b'}")[0].kind, /fixable/);
});

test('ordinary words and prose suggest nothing', () => {
  for (const text of ['', '   ', 'password', 'hello world', 'The quick brown fox jumps over the lazy dog.', 'abcdefgh']) {
    assert.deepEqual(idsFor(text), [], text);
  }
});

test('every suggestion is unique and the list is short', () => {
  const ids = idsFor('https://example.com/a%20b');
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.length <= 4);
});

test('a large paste is detected quickly', () => {
  const inputs = [
    '['.repeat(50_000),
    ' '.repeat(50_000) + 'x',
    'rgb(1' + ' '.repeat(50_000),
    '*'.repeat(50_000),
    '- a\n'.repeat(20_000),
    'A'.repeat(400_000),
  ];
  for (const input of inputs) {
    const started = performance.now();
    detectContent(input);
    assert.ok(performance.now() - started < 250, `slow on ${JSON.stringify(input.slice(0, 12))}…`);
  }
});
