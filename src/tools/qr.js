import { h, copyBtn } from '../dom.js';
import { keyValueRow } from '../panel.js';
import { encodeQr, qrToSvg, qrToCanvas } from '../qr.js';

const LEVELS = [
  ['L', 'L — recovers ~7%'],
  ['M', 'M — recovers ~15%'],
  ['Q', 'Q — recovers ~25%'],
  ['H', 'H — recovers ~30%'],
];

// Ready-made payload shapes, so the common "what is the syntax for a WiFi QR?"
// question is answered by the tool rather than a search.
const TEMPLATES = {
  'Plain text': '',
  URL: 'https://',
  'WiFi network': 'WIFI:T:WPA;S:network-name;P:password;;',
  Email: 'mailto:someone@example.com?subject=Hello',
  'Phone number': 'tel:+15551234567',
  'SMS message': 'smsto:+15551234567:Hello',
  'Calendar event': 'BEGIN:VEVENT\nSUMMARY:Title\nDTSTART:20260901T090000Z\nDTEND:20260901T100000Z\nEND:VEVENT',
  'Contact card': 'BEGIN:VCARD\nVERSION:3.0\nN:Lovelace;Ada\nTEL:+15551234567\nEMAIL:ada@example.com\nEND:VCARD',
  Location: 'geo:37.7749,-122.4194',
};

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = h('a', { href: url, download: filename });
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function qrMount(body) {
  const input = h('textarea', { class: 'io-textarea', spellcheck: 'false', placeholder: 'https://example.com' });
  // A one-shot action, not state: persisting it would re-seed the input and
  // overwrite the saved content when the tool is reopened.
  const template = h('select', { class: 'select', 'data-no-persist': true },
    ...Object.keys(TEMPLATES).map((name) => h('option', {}, name)));
  const level = h('select', { class: 'select' },
    ...LEVELS.map(([value, label]) => h('option', { value, ...(value === 'M' ? { selected: true } : {}) }, label)));
  const scale = h('input', { class: 'slider', type: 'range', min: '2', max: '20', value: '8' });
  const margin = h('input', { class: 'slider', type: 'range', min: '0', max: '8', value: '4' });
  const darkColor = h('input', { type: 'color', class: 'color-picker', value: '#000000' });
  const lightColor = h('input', { type: 'color', class: 'color-picker', value: '#ffffff' });
  const error = h('div', { class: 'io-error' });

  const canvas = h('canvas', { class: 'qr-canvas' });
  const preview = h('div', { class: 'qr-preview' }, canvas);
  const versionRow = keyValueRow('Version');
  const modeRow = keyValueRow('Mode');
  const sizeRow = keyValueRow('Modules');
  const capacityRow = keyValueRow('Payload');

  let matrix = null;
  const options = () => ({
    scale: Number(scale.value),
    margin: Number(margin.value),
    dark: darkColor.value,
    light: lightColor.value,
  });

  const run = () => {
    const text = input.value;
    error.textContent = '';
    if (!text) {
      matrix = null;
      canvas.width = 0;
      canvas.height = 0;
      [versionRow, modeRow, sizeRow, capacityRow].forEach((row) => { row.value.textContent = '—'; });
      return;
    }
    try {
      matrix = encodeQr(text, { level: level.value });
    } catch (failure) {
      matrix = null;
      canvas.width = 0;
      canvas.height = 0;
      error.textContent = failure.message;
      return;
    }
    qrToCanvas(matrix, canvas, options());
    versionRow.value.textContent = `${matrix.version} of 40`;
    modeRow.value.textContent = matrix.mode;
    sizeRow.value.textContent = `${matrix.size} × ${matrix.size}`;
    capacityRow.value.textContent = `${new TextEncoder().encode(text).length} bytes`;
  };

  const svgText = () => (matrix ? qrToSvg(matrix, options()) : '');

  const actions = h('div', { class: 'tool-actions' },
    h('button', {
      class: 'btn btn-primary', type: 'button',
      onClick: () => canvas.width && canvas.toBlob((blob) => download(blob, 'qr-code.png')),
    }, 'Download PNG'),
    h('button', {
      class: 'btn', type: 'button',
      onClick: () => matrix && download(new Blob([svgText()], { type: 'image/svg+xml' }), 'qr-code.svg'),
    }, 'Download SVG'),
    copyBtn(svgText),
  );

  template.addEventListener('change', () => {
    const seed = TEMPLATES[template.value];
    if (seed) { input.value = seed; input.dispatchEvent(new Event('input', { bubbles: true })); }
    input.focus();
  });
  input.addEventListener('input', run);
  [level, scale, margin, darkColor, lightColor].forEach((control) => control.addEventListener('input', run));

  body.append(
    h('div', { class: 'io-grid' },
      h('div', { class: 'io-box' },
        h('div', { class: 'io-label-row' }, h('span', { class: 'io-label' }, 'Content'), template),
        input,
        error,
      ),
      h('div', { class: 'io-box' },
        h('div', { class: 'io-label' }, 'Preview'),
        preview,
      ),
    ),
    h('div', { class: 'qr-controls' },
      h('label', { class: 'qr-control' }, h('span', { class: 'part-label' }, 'Error correction'), level),
      h('label', { class: 'qr-control' }, h('span', { class: 'part-label' }, 'Module size'), scale),
      h('label', { class: 'qr-control' }, h('span', { class: 'part-label' }, 'Quiet zone'), margin),
      h('label', { class: 'qr-control' }, h('span', { class: 'part-label' }, 'Dark'), darkColor),
      h('label', { class: 'qr-control' }, h('span', { class: 'part-label' }, 'Light'), lightColor),
    ),
    h('div', { class: 'kv-list' }, versionRow.row, modeRow.row, sizeRow.row, capacityRow.row),
    actions,
    h('p', { class: 'tool-hint' }, 'A higher error-correction level survives more damage but needs a larger symbol. Numeric and uppercase-only text pack far denser than mixed case.'),
  );
  input.focus();
}

export default [
  {
    id: 'qr-generate', category: 'Generate', name: 'QR Code', title: 'QR Code Generator',
    desc: 'Build a QR code from any text, URL, WiFi login or contact card. Encodes locally — nothing is uploaded — and downloads as PNG or SVG.',
    mount: qrMount,
  },
];
