import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeQr, qrToSvg } from '../src/qr.js';
import { scanQr, dataCodewordCount } from './helpers/qr-scanner.js';

const LEVELS = ['L', 'M', 'Q', 'H'];

// Byte capacities at version 40 — anything longer must be refused.
const MAX_BYTES = { L: 2953, M: 2331, Q: 1663, H: 1273 };

const PAYLOADS = [
  ['numeric', '12345678901234567890'],
  ['alphanumeric', 'HELLO WORLD'],
  ['url', 'https://example.com/a/b?c=d#fragment'],
  ['unicode', 'héllo wörld — ünïcode ✓ 日本語'],
  ['wifi', 'WIFI:T:WPA;S:my-network;P:s3cr3t!;;'],
  ['vcard', 'BEGIN:VCARD\nVERSION:3.0\nN:Lovelace;Ada\nTEL:+15551234567\nEND:VCARD'],
  ['json', JSON.stringify({ tool: 'webTools', nested: { list: [1, 2, 3] } })],
  ['long numeric', '9'.repeat(1000)],
  ['long alphanumeric', 'HTTPS://EXAMPLE.COM/PATH '.repeat(40)],
  ['long byte', 'x'.repeat(1200)],
];

test('every payload round-trips at every error-correction level', async (t) => {
  for (const level of LEVELS) {
    for (const [label, text] of PAYLOADS) {
      await t.test(`${level} · ${label}`, () => {
        const matrix = encodeQr(text, { level });
        const scanned = scanQr(matrix);

        assert.equal(scanned.text, text, 'decoded text must match the input');
        assert.equal(scanned.level, level, 'format info must carry the chosen level');
        assert.equal(scanned.mode, matrix.mode, 'reported mode must match what was encoded');
        assert.ok(scanned.parityOk, 'Reed-Solomon parity must be zero for every block');
        assert.equal(matrix.size, matrix.version * 4 + 17);
        assert.ok(scanned.mask >= 0 && scanned.mask <= 7);
      });
    }
  }
});

test('all forty versions encode and decode', async (t) => {
  for (let version = 1; version <= 40; version++) {
    await t.test(`version ${version}`, () => {
      // Fill the version almost exactly, so the encoder has to pick this one.
      const countBits = version <= 9 ? 9 : version <= 26 ? 11 : 13;
      const pairs = Math.floor((dataCodewordCount(version, 'L') * 8 - 4 - countBits) / 11);
      const text = 'A'.repeat(Math.max(1, pairs * 2));

      const matrix = encodeQr(text, { level: 'L' });
      assert.equal(matrix.version, version, 'must choose the smallest version that fits');

      const scanned = scanQr(matrix);
      assert.equal(scanned.text, text);
      assert.ok(scanned.parityOk);
    });
  }
});

test('the narrowest mode that covers the text is chosen', () => {
  assert.equal(encodeQr('12345', { level: 'M' }).mode, 'numeric');
  assert.equal(encodeQr('HELLO 123', { level: 'M' }).mode, 'alphanumeric');
  assert.equal(encodeQr('hello', { level: 'M' }).mode, 'byte', 'lowercase forces byte mode');
  assert.equal(encodeQr('café', { level: 'M' }).mode, 'byte');
});

test('a denser mode produces a smaller symbol', () => {
  const numeric = encodeQr('1'.repeat(100), { level: 'M' });
  const byte = encodeQr('a'.repeat(100), { level: 'M' });
  assert.ok(numeric.version < byte.version, 'numeric must pack tighter than byte mode');
});

test('a stronger level needs at least as large a symbol', () => {
  const text = 'https://example.com/some/reasonably/long/path';
  const versions = LEVELS.map((level) => encodeQr(text, { level }).version);
  for (let i = 1; i < versions.length; i++) {
    assert.ok(versions[i] >= versions[i - 1], `${LEVELS[i]} must not be smaller than ${LEVELS[i - 1]}`);
  }
});

test('minVersion forces a larger symbol without breaking the decode', () => {
  const matrix = encodeQr('HELLO', { level: 'M', minVersion: 10 });
  assert.equal(matrix.version, 10);
  assert.equal(scanQr(matrix).text, 'HELLO');
});

test('over-capacity payloads are refused rather than truncated', () => {
  for (const level of LEVELS) {
    const text = 'x'.repeat(MAX_BYTES[level] + 1);
    assert.throws(() => encodeQr(text, { level }), /Too much data/, `${level} must refuse ${text.length} bytes`);
  }
});

test('a payload at exactly the capacity limit still encodes', () => {
  for (const level of LEVELS) {
    const matrix = encodeQr('x'.repeat(MAX_BYTES[level]), { level });
    assert.equal(matrix.version, 40);
    assert.ok(scanQr(matrix).parityOk);
  }
});

test('bad arguments are rejected', () => {
  assert.throws(() => encodeQr(''), /Nothing to encode/);
  assert.throws(() => encodeQr('hi', { level: 'Z' }), /Unknown error-correction level/);
});

test('finder patterns sit in the three corners', () => {
  const { modules, size } = encodeQr('HELLO WORLD', { level: 'M' });
  // A finder is a 7x7 ring: dark border, light gap, dark 3x3 core.
  const isFinderAt = (top, left) => {
    for (let row = 0; row < 7; row++) {
      for (let column = 0; column < 7; column++) {
        const ring = Math.max(Math.abs(row - 3), Math.abs(column - 3));
        if (modules[top + row][left + column] !== (ring !== 2 && ring <= 3)) return false;
      }
    }
    return true;
  };
  assert.ok(isFinderAt(0, 0), 'top-left');
  assert.ok(isFinderAt(0, size - 7), 'top-right');
  assert.ok(isFinderAt(size - 7, 0), 'bottom-left');
});

test('timing patterns alternate along row and column six', () => {
  const { modules, size } = encodeQr('HELLO WORLD', { level: 'Q' });
  for (let i = 8; i < size - 8; i++) {
    assert.equal(modules[6][i], i % 2 === 0, `row 6 column ${i}`);
    assert.equal(modules[i][6], i % 2 === 0, `column 6 row ${i}`);
  }
});

test('the always-dark module is dark', () => {
  const { modules, size } = encodeQr('HELLO', { level: 'H' });
  assert.equal(modules[size - 8][8], true);
});

test('SVG output covers every dark module inside a quiet zone', () => {
  const matrix = encodeQr('HELLO WORLD', { level: 'M' });
  const svg = qrToSvg(matrix, { scale: 4, margin: 4 });
  const span = matrix.size + 8;

  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.ok(svg.includes(`viewBox="0 0 ${span} ${span}"`));
  assert.ok(svg.includes(`width="${span * 4}"`));
  assert.equal(svg.endsWith('</svg>'), true);

  const darkModules = matrix.modules.flat().filter(Boolean).length;
  const drawnRects = (svg.match(/M\d+ \d+h1v1h-1z/g) ?? []).length;
  assert.equal(drawnRects, darkModules, 'one path segment per dark module');
});

test('custom colors reach the SVG', () => {
  const svg = qrToSvg(encodeQr('HI', { level: 'L' }), { dark: '#123456', light: '#fedcba' });
  assert.ok(svg.includes('fill="#123456"'));
  assert.ok(svg.includes('fill="#fedcba"'));
});
