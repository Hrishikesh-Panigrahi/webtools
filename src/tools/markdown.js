import { h, copyBtn } from '../dom.js';

// A deliberately small, safe Markdown -> HTML converter.
//
// Safety model: every scrap of source text is HTML-escaped before any tag is
// emitted, so raw HTML in the input is shown literally and can never inject
// markup. Only a fixed set of tags is produced, and link URLs are scheme-checked
// so `javascript:` and friends are dropped. Code (fenced blocks handled in the
// block loop, inline spans split out below) is escaped and never interpreted.

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SAFE_URL = /^(https?:|mailto:|#|\/|\.)/i;

// Inline spans: split on backtick code so emphasis/link rules never touch code.
function inline(text) {
  return text.split(/(`[^`]+`)/g).map((seg) => {
    if (seg.length >= 2 && seg.startsWith('`') && seg.endsWith('`')) {
      return `<code>${escapeHtml(seg.slice(1, -1))}</code>`;
    }
    let t = escapeHtml(seg)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+)__/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/_([^_]+)_/g, '<em>$1</em>');
    return t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, label, url) =>
      SAFE_URL.test(url) ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>` : whole);
  }).join('');
}

const isBlank = (l) => /^\s*$/.test(l);
const isFence = (l) => /^```/.test(l.trim());
const isSpecial = (l) => isFence(l) || /^(#{1,6})\s/.test(l) || /^\s*>/.test(l)
  || /^\s*[-*+]\s+/.test(l) || /^\s*\d+\.\s+/.test(l);

function mdToHtml(src) {
  const lines = src.split('\n');
  const html = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (isFence(line)) {
      const buf = [];
      i++; // opening fence
      while (i < lines.length && !isFence(lines[i])) buf.push(lines[i++]);
      i++; // closing fence (if present)
      html.push(`<pre class="md-pre"><code>${escapeHtml(buf.join('\n'))}</code></pre>`);
      continue;
    }
    if (isBlank(line)) { i++; continue; }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) { const lvl = heading[1].length; html.push(`<h${lvl} class="md-h">${inline(heading[2])}</h${lvl}>`); i++; continue; }

    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { html.push('<hr class="md-hr">'); i++; continue; }

    if (/^\s*>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      html.push(`<blockquote class="md-quote">${inline(buf.join(' '))}</blockquote>`);
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*+]\s+/, ''));
      html.push('<ul class="md-list">' + items.map((it) => `<li>${inline(it)}</li>`).join('') + '</ul>');
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+\.\s+/, ''));
      html.push('<ol class="md-list">' + items.map((it) => `<li>${inline(it)}</li>`).join('') + '</ol>');
      continue;
    }

    const buf = [];
    while (i < lines.length && !isBlank(lines[i]) && !isSpecial(lines[i])) buf.push(lines[i++]);
    html.push(`<p class="md-p">${inline(buf.join('\n')).replace(/\n/g, '<br>')}</p>`);
  }
  return html.join('\n');
}

function markdownMount(body) {
  const input = h('textarea', { class: 'io-textarea', placeholder: '# Hello\n\nSome **bold** text with a [link](https://example.com) and `code`.', spellcheck: 'false' });
  const preview = h('div', { class: 'md-preview' });
  const render = () => { preview.innerHTML = mdToHtml(input.value); };
  input.addEventListener('input', render);
  body.append(
    h('div', { class: 'io-grid json-split' },
      h('div', { class: 'io-box' }, h('div', { class: 'io-label' }, 'Markdown'), input),
      h('div', { class: 'io-box' },
        h('div', { class: 'io-label-row' }, h('span', { class: 'io-label' }, 'Preview'), copyBtn(() => input.value)),
        preview,
      ),
    ),
  );
  input.focus();
  render();
}

export default [
  { id: 'md-preview', category: 'Text', name: 'Markdown', title: 'Markdown Preview', desc: 'Live preview of a common Markdown subset. Raw HTML is escaped and link URLs are sanitized.', mount: markdownMount },
];
