import { h, copyBtn } from '../dom.js';

// --- Unix timestamp <-> human date ---
function timestampMount(body) {
  const tsField = h('input', { class: 'url-field', spellcheck: 'false', placeholder: '1700000000 or 1700000000000' });
  const nowBtn = h('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, 'Now');
  const out = h('div', { class: 'color-outputs' });
  const rows = {};
  for (const key of ['ISO 8601 (UTC)', 'Local', 'Relative', 'Unix (s)', 'Unix (ms)']) {
    const val = h('input', { class: 'part-input', readonly: true, spellcheck: 'false' });
    rows[key] = val;
    out.append(h('div', { class: 'color-out-row' }, h('span', { class: 'part-label' }, key), val, copyBtn(() => val.value)));
  }
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const rel = (d) => {
    const s = (d.getTime() - Date.now()) / 1000;
    const abs = Math.abs(s);
    const units = [['year', 31536000], ['day', 86400], ['hour', 3600], ['minute', 60], ['second', 1]];
    for (const [u, sec] of units) if (abs >= sec || u === 'second') return rtf.format(Math.round(s / sec), u);
  };
  const render = (d) => {
    rows['ISO 8601 (UTC)'].value = d.toISOString();
    rows['Local'].value = d.toString();
    rows['Relative'].value = rel(d);
    rows['Unix (s)'].value = Math.floor(d.getTime() / 1000);
    rows['Unix (ms)'].value = d.getTime();
  };
  const run = () => {
    const raw = tsField.value.trim();
    if (!raw) return;
    let n = Number(raw);
    let d;
    if (!Number.isNaN(n)) {
      if (raw.length <= 11) n *= 1000; // seconds -> ms
      d = new Date(n);
    } else {
      d = new Date(raw);
    }
    if (Number.isNaN(d.getTime())) return;
    render(d);
  };
  tsField.addEventListener('input', run);
  nowBtn.addEventListener('click', () => { tsField.value = String(Math.floor(Date.now() / 1000)); run(); });
  body.append(
    h('div', { class: 'io-box' },
      h('div', { class: 'io-label' }, 'Timestamp or date string'),
      h('div', { class: 'color-input-row' }, tsField, nowBtn),
    ),
    out,
  );
  tsField.focus();
}

// --- Number base converter ---
function baseMount(body) {
  const bases = [['Decimal', 10], ['Hexadecimal', 16], ['Octal', 8], ['Binary', 2]];
  const fields = {};
  const wrap = h('div', { class: 'color-outputs' });
  const update = (from, value) => {
    let n;
    try { n = BigInt(value === '' ? '0' : (from === 10 ? value : parseRadix(value, from))); }
    catch { for (const [, b] of bases) if (b !== from) fields[b].classList.add('bad'); return; }
    for (const [, b] of bases) {
      fields[b].classList.remove('bad');
      if (b !== from) fields[b].value = value === '' ? '' : n.toString(b);
    }
  };
  const parseRadix = (str, radix) => {
    const digits = '0123456789abcdefghijklmnopqrstuvwxyz'.slice(0, radix);
    str = str.trim().toLowerCase().replace(/^0x|^0b|^0o/, '');
    let n = 0n; const R = BigInt(radix);
    for (const ch of str) {
      const d = digits.indexOf(ch);
      if (d < 0) throw new Error('bad digit');
      n = n * R + BigInt(d);
    }
    return '0x' + n.toString(16);
  };
  const placeholders = { 10: 'e.g. 255', 16: 'ff', 8: '377', 2: '11111111' };
  for (const [label, b] of bases) {
    const inp = h('input', { class: 'part-input', spellcheck: 'false', placeholder: placeholders[b] });
    fields[b] = inp;
    inp.addEventListener('input', () => update(b, inp.value.trim()));
    wrap.append(h('div', { class: 'color-out-row' }, h('span', { class: 'part-label' }, label), inp, copyBtn(() => inp.value)));
  }
  body.append(h('p', { class: 'tool-hint' }, 'Type a number in any base — the others update instantly.'), wrap);
  fields[10].focus();
}

export default [
  { id: 'time-unix', category: 'Convert', name: 'Timestamp', title: 'Unix Timestamp Converter', desc: 'Convert between Unix timestamps and human-readable dates, both ways.', mount: timestampMount },
  { id: 'num-base', category: 'Convert', name: 'Number Base', title: 'Number Base Converter', desc: 'Convert integers between decimal, hex, octal and binary (arbitrary precision).', mount: baseMount },
];
