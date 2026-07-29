import { h, copyBtn } from '../dom.js';
import { toggleRow } from '../panel.js';

// --- Unix timestamp <-> human date ---

// All-digit input is an epoch; ten digits or fewer means seconds rather than
// milliseconds. Anything else is left to Date, which reads ISO 8601 and the
// usual human formats.
function parseMoment(raw) {
  const digits = /^-?\d+$/.test(raw);
  const scale = digits && raw.replace('-', '').length <= 10 ? 1000 : 1;
  const date = digits ? new Date(Number(raw) * scale) : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function timestampMount(body) {
  const tsField = h('input', { class: 'url-field', spellcheck: 'false', placeholder: '1700000000 or 1700000000000' });
  const nowBtn = h('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, 'Now');
  const error = h('div', { class: 'io-error' });
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
  const blank = () => { for (const key in rows) rows[key].value = ''; };

  const run = () => {
    const raw = tsField.value.trim();
    error.textContent = '';
    if (!raw) { blank(); return; }
    const date = parseMoment(raw);
    if (!date) {
      blank();
      error.textContent = 'Not a Unix timestamp or a date this browser recognises.';
      return;
    }
    render(date);
  };

  tsField.addEventListener('input', run);
  nowBtn.addEventListener('click', () => { tsField.value = String(Math.floor(Date.now() / 1000)); run(); });

  body.append(
    h('div', { class: 'io-box' },
      h('div', { class: 'io-label' }, 'Timestamp or date string'),
      h('div', { class: 'color-input-row' }, tsField, nowBtn),
      error,
    ),
    out,
  );
  tsField.focus();
}

// --- Number base converter ---
const BASES = [['Decimal', 10], ['Hexadecimal', 16], ['Octal', 8], ['Binary', 2]];
const PLACEHOLDERS = { 10: 'e.g. 255', 16: 'ff', 8: '377', 2: '11111111' };
const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';

/**
 * Parse an integer written in `radix` as a BigInt, tolerating a sign, digit
 * grouping and the usual `0x` / `0b` / `0o` prefixes.
 * Throws if any character isn't a digit of that radix.
 */
function parseInteger(text, radix) {
  const cleaned = text.trim().toLowerCase().replace(/[\s_,]/g, '');
  const digits = cleaned.replace(/^[+-]/, '').replace(/^0[xbo]/, '');
  if (!digits) throw new Error('no digits');
  const alphabet = DIGITS.slice(0, radix);
  let value = 0n;
  for (const character of digits) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) throw new Error('not a digit of this base');
    value = value * BigInt(radix) + BigInt(digit);
  }
  return cleaned.startsWith('-') ? -value : value;
}

function baseMount(body) {
  const fields = {};
  const wrap = h('div', { class: 'color-outputs' });

  // Mark the field being typed in — not the others — when it doesn't parse.
  const update = (fromBase, raw) => {
    fields[fromBase].classList.remove('bad');
    const others = BASES.map(([, base]) => base).filter((base) => base !== fromBase);
    if (raw === '') {
      others.forEach((base) => { fields[base].classList.remove('bad'); fields[base].value = ''; });
      return;
    }
    let value;
    try {
      value = parseInteger(raw, fromBase);
    } catch {
      fields[fromBase].classList.add('bad');
      return;
    }
    others.forEach((base) => {
      fields[base].classList.remove('bad');
      fields[base].value = value.toString(base);
    });
  };

  for (const [label, base] of BASES) {
    const field = h('input', { class: 'part-input', spellcheck: 'false', placeholder: PLACEHOLDERS[base] });
    fields[base] = field;
    field.addEventListener('input', () => update(base, field.value));
    wrap.append(h('div', { class: 'color-out-row' }, h('span', { class: 'part-label' }, label), field, copyBtn(() => field.value)));
  }

  body.append(h('p', { class: 'tool-hint' }, 'Type a number in any base — the others update instantly. Negatives and arbitrarily large values are fine.'), wrap);
  fields[10].focus();
}

// --- CSV <-> JSON ---
const DELIMITERS = { Comma: ',', Tab: '\t', Semicolon: ';', Pipe: '|' };

/** Split CSV text into rows of fields, honouring quoted fields and "" escapes. */
function parseCsv(text, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const character = text[i];
    if (quoted) {
      if (character !== '"') { field += character; continue; }
      if (text[i + 1] === '"') { field += '"'; i++; continue; }
      quoted = false;
      continue;
    }
    if (character === '"') { quoted = true; continue; }
    if (character === delimiter) { row.push(field); field = ''; continue; }
    if (character === '\r') continue;
    if (character === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += character;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const NUMERIC = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/;

// Spreadsheet exports are all strings, so typing is opt-in: leading zeros and
// anything else non-canonical stays text, keeping IDs like `007` intact.
function coerce(value) {
  if (value === '') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return NUMERIC.test(value) ? Number(value) : value;
}

function csvToJson(text, delimiter, typed) {
  const rows = parseCsv(text, delimiter).filter((row) => row.some((cell) => cell !== ''));
  if (!rows.length) return '';
  const [headers, ...body] = rows;
  const records = body.map((row) => Object.fromEntries(
    headers.map((header, index) => [header, typed ? coerce(row[index] ?? '') : row[index] ?? '']),
  ));
  return JSON.stringify(records, null, 2);
}

const quoteCell = (value, delimiter) => {
  const ambiguous = value.includes('"') || value.includes('\n') || value.includes('\r') || value.includes(delimiter);
  return ambiguous ? `"${value.replace(/"/g, '""')}"` : value;
};

function jsonToCsv(text, delimiter) {
  const parsed = JSON.parse(text);
  const records = Array.isArray(parsed) ? parsed : [parsed];
  if (!records.length) return '';
  if (records.some((record) => record === null || typeof record !== 'object' || Array.isArray(record))) {
    throw new Error('Expected an array of objects — each row needs named fields.');
  }
  const headers = [...new Set(records.flatMap(Object.keys))];
  const cell = (value) => {
    if (value === null || value === undefined) return '';
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  };
  return [headers, ...records.map((record) => headers.map((header) => cell(record[header])))]
    .map((row) => row.map((value) => quoteCell(value, delimiter)).join(delimiter))
    .join('\n');
}

const CSV_TO_JSON = 'CSV → JSON';
const TYPED = 'Parse numbers & booleans';

function csvMount(body) {
  const direction = h('select', { class: 'select' }, ...[CSV_TO_JSON, 'JSON → CSV'].map((label) => h('option', {}, label)));
  const delimiter = h('select', { class: 'select' }, ...Object.keys(DELIMITERS).map((label) => h('option', {}, label)));
  const { row: options, boxes } = toggleRow([TYPED]);
  const input = h('textarea', { class: 'io-textarea tall', spellcheck: 'false' });
  const output = h('textarea', { class: 'io-textarea tall', readonly: true, spellcheck: 'false' });
  const error = h('div', { class: 'io-error' });
  const inputLabel = h('span', { class: 'io-label' }, 'CSV');
  const outputLabel = h('span', { class: 'io-label' }, 'JSON');

  const run = () => {
    const toJson = direction.value === CSV_TO_JSON;
    inputLabel.textContent = toJson ? 'CSV' : 'JSON';
    outputLabel.textContent = toJson ? 'JSON' : 'CSV';
    input.placeholder = toJson ? 'name,role\nAda,engineer' : '[{"name":"Ada","role":"engineer"}]';
    options.hidden = !toJson;

    error.textContent = '';
    if (!input.value.trim()) { output.value = ''; return; }
    try {
      output.value = toJson
        ? csvToJson(input.value, DELIMITERS[delimiter.value], boxes[TYPED].checked)
        : jsonToCsv(input.value, DELIMITERS[delimiter.value]);
    } catch (e) {
      output.value = '';
      error.textContent = e.message;
    }
  };

  input.addEventListener('input', run);
  [direction, delimiter].forEach((select) => select.addEventListener('change', run));
  boxes[TYPED].addEventListener('change', run);

  body.append(
    h('div', { class: 'tool-actions' },
      direction,
      h('span', { class: 'io-label' }, 'Delimiter'), delimiter,
      options,
    ),
    h('div', { class: 'io-grid' },
      h('div', { class: 'io-box' }, h('div', { class: 'io-label-row' }, inputLabel), input, error),
      h('div', { class: 'io-box' },
        h('div', { class: 'io-label-row' }, outputLabel, copyBtn(() => output.value)),
        output,
      ),
    ),
  );
  run();
  input.focus();
}

export default [
  { id: 'time-unix', category: 'Convert', name: 'Timestamp', title: 'Unix Timestamp Converter', desc: 'Convert between Unix timestamps and human-readable dates, both ways.', mount: timestampMount },
  { id: 'num-base', category: 'Convert', name: 'Number Base', title: 'Number Base Converter', desc: 'Convert integers between decimal, hex, octal and binary (arbitrary precision).', mount: baseMount },
  {
    id: 'csv-json', category: 'Convert', name: 'CSV ⇄ JSON', title: 'CSV ⇄ JSON Converter',
    desc: 'Turn a spreadsheet export into JSON records, or JSON back into CSV. Quoted fields, embedded newlines and custom delimiters all work.',
    mount: csvMount,
  },
];
