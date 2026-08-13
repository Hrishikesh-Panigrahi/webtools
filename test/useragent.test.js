import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUserAgent } from '../src/useragent.js';

const AGENTS = {
  chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
  opera: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 OPR/112.0.0.0',
  firefox: 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
  safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36',
  ie11: 'Mozilla/5.0 (Windows NT 6.1; Trident/7.0; rv:11.0) like Gecko',
  googlebot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  bingbot: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  curl: 'curl/8.4.0',
  python: 'python-requests/2.31.0',
  headless: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/126.0.0.0 Safari/537.36',
  playstation: 'Mozilla/5.0 (PlayStation; PlayStation 5/2.26) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0 Safari/605.1.15',
};

/** Turn the row list into a lookup so assertions read clearly. */
const parse = (text) => {
  const { rows, isBot, notes } = parseUserAgent(text);
  return { ...Object.fromEntries(rows), isBot, notes };
};

test('desktop browsers are identified, with the more specific one winning', () => {
  assert.equal(parse(AGENTS.chrome).Browser, 'Chrome 126.0.0.0');
  assert.equal(parse(AGENTS.edge).Browser, 'Edge 126.0.0.0', 'Edge also claims Chrome');
  assert.equal(parse(AGENTS.opera).Browser, 'Opera 112.0.0.0', 'Opera also claims Chrome');
  assert.equal(parse(AGENTS.firefox).Browser, 'Firefox 127.0');
  assert.equal(parse(AGENTS.safariMac).Browser, 'Safari 17.5');
  assert.equal(parse(AGENTS.samsung).Browser, 'Samsung Internet 23.0');
  assert.equal(parse(AGENTS.ie11).Browser, 'Internet Explorer 11.0');
});

test('rendering engines are identified', () => {
  assert.equal(parse(AGENTS.chrome).Engine, 'Blink 126.0.0.0');
  assert.equal(parse(AGENTS.safariMac).Engine, 'WebKit 605.1.15');
  assert.equal(parse(AGENTS.ie11).Engine, 'Trident 7.0');
  assert.match(parse(AGENTS.firefox).Engine, /^Gecko/);
});

test('operating systems and versions', () => {
  assert.equal(parse(AGENTS.chrome)['Operating system'], 'Windows 10 or 11');
  assert.equal(parse(AGENTS.ie11)['Operating system'], 'Windows 7');
  assert.equal(parse(AGENTS.firefox)['Operating system'], 'Ubuntu Linux');
  assert.equal(parse(AGENTS.safariMac)['Operating system'], 'macOS 10.15.7');
  assert.equal(parse(AGENTS.iphone)['Operating system'], 'iOS 17.5');
  assert.equal(parse(AGENTS.ipad)['Operating system'], 'iPadOS 17.5');
  assert.equal(parse(AGENTS.android)['Operating system'], 'Android 14');
});

test('device classes', () => {
  assert.equal(parse(AGENTS.chrome).Device, 'Desktop');
  assert.equal(parse(AGENTS.iphone).Device, 'Phone');
  assert.equal(parse(AGENTS.ipad).Device, 'Tablet');
  assert.equal(parse(AGENTS.android).Device, 'Phone');
  assert.equal(parse(AGENTS.playstation).Device, 'Console');
});

test('device models are extracted where present', () => {
  assert.equal(parse(AGENTS.android).Model, 'Pixel 8 Pro');
  assert.equal(parse(AGENTS.samsung).Model, 'SM-S918B');
  assert.equal(parse(AGENTS.chrome).Model, '—');
});

test('CPU architecture is read from the platform token', () => {
  assert.equal(parse(AGENTS.chrome).Architecture, 'x86-64');
  assert.equal(parse(AGENTS.firefox).Architecture, 'x86-64');
});

test('bots and tools are flagged, browsers are not', () => {
  for (const key of ['googlebot', 'bingbot', 'curl', 'python', 'headless']) {
    const parsed = parse(AGENTS[key]);
    assert.equal(parsed.isBot, true, `${key} should be flagged`);
    assert.equal(parsed.Type, 'Bot or tool');
  }
  for (const key of ['chrome', 'firefox', 'safariMac', 'iphone', 'android']) {
    assert.equal(parse(AGENTS[key]).isBot, false, `${key} should not be flagged`);
  }
});

test('named bots report their own version', () => {
  assert.equal(parse(AGENTS.googlebot).Agent, 'Googlebot 2.1');
  assert.equal(parse(AGENTS.curl).Agent, 'curl 8.4.0');
  assert.equal(parse(AGENTS.python).Agent, 'Python requests 2.31.0');
});

test('an unknown string still returns a full row set', () => {
  const parsed = parse('SomeBrandNewBrowser/1.0');
  assert.equal(parsed.Browser, 'Unknown');
  assert.equal(parsed.Engine, '—');
  assert.equal(parsed['Operating system'], '—');
  assert.equal(parsed.Device, 'Desktop');
});

test('notes explain the misleading parts of the string', () => {
  const chrome = parse(AGENTS.chrome);
  assert.ok(chrome.notes.some((note) => /Chrome and Safari/.test(note)));
  assert.ok(chrome.notes.some((note) => /Client Hints/.test(note)));
  assert.ok(parse(AGENTS.headless).notes.some((note) => /automation/.test(note)));
});

test('empty input is rejected', () => {
  assert.throws(() => parseUserAgent('   '), /Paste a User-Agent/);
});
