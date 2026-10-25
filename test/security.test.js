import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, isSafeUrl, sanitizeStateValues, findSecret } from '../src/lib/security.js';

test('escapeHtml neutralises every character that can open markup or an attribute', () => {
  assert.equal(escapeHtml(`<img src=x onerror="alert('x')">&`), '&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;');
  assert.equal(escapeHtml('plain'), 'plain');
});

test('isSafeUrl allows web, mail and relative links only', () => {
  for (const url of ['https://example.com', 'http://a.b/c?d#e', 'mailto:a@b.c', '#top', '/docs', './a', '../b', 'page.html', '//cdn.example.com/x']) {
    assert.equal(isSafeUrl(url), true, url);
  }
  for (const url of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'java\tscript:alert(1)', ' javascript:alert(1)',
    'java\u0000script:x', 'data:text/html,<script>', 'vbscript:x', 'file:///etc/passwd', 'blob:https://x/y']) {
    assert.equal(isSafeUrl(url), false, JSON.stringify(url));
  }
});

test('sanitizeStateValues accepts only short lists of strings and booleans', () => {
  assert.deepEqual(sanitizeStateValues(['a', true, '']), ['a', true, '']);
  for (const values of [null, 'a', {}, [1], [null], [{}], [['nested']], Array(65).fill('x'), ['x'.repeat(5_000_001)]]) {
    assert.equal(sanitizeStateValues(values), null, JSON.stringify(values)?.slice(0, 40));
  }
});

test('findSecret names common credentials', () => {
  const cases = {
    'a JWT': 'token: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.sig',
    'a private key': '-----BEGIN RSA PRIVATE KEY-----\nMIIE...',
    'an AWS access key': 'aws_access_key_id = AKIAIOSFODNN7EXAMPLE',
    'a GitHub token': 'ghp_' + 'a'.repeat(36),
    'a Slack token': 'xoxb-1234567890-abcdef',
    'an API key': 'sk-ant-' + 'b'.repeat(40),
    'a bearer token': 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz012345',
    'a password in a URL': 'postgres://admin:hunter2@db.internal:5432/app',
  };
  for (const [kind, text] of Object.entries(cases)) assert.equal(findSecret(text), kind, text);
});

test('findSecret stays quiet on ordinary input', () => {
  for (const text of ['', '{"name":"Ada"}', 'https://example.com/path?q=1', 'Bearer of bad news', 'skeleton key']) {
    assert.equal(findSecret(text), null, text);
  }
});

test('findSecret is fast on adversarial input', () => {
  for (const input of ['eyJ'.repeat(100_000), 'a'.repeat(500_000), 'a://' + 'b'.repeat(300_000), 'Bearer '.repeat(50_000)]) {
    const started = performance.now();
    findSecret(input);
    assert.ok(performance.now() - started < 250, `slow on ${input.slice(0, 12)}…`);
  }
});
