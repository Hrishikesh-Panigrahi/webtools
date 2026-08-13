import { h, copyBtn, icons } from '../dom.js';

function parseColor(str) {
  str = str.trim();
  let m;
  if ((m = str.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i))) {
    let hex = m[1];
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }
  if ((m = str.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i))) {
    return [+m[1], +m[2], +m[3]];
  }
  if ((m = str.match(/hsla?\(\s*(\d+)[,\s]+(\d+)%?[,\s]+(\d+)%?/i))) {
    return hslToRgb(+m[1], +m[2], +m[3]);
  }
  return null;
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function hslToRgb(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
}

const toHex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

function colorMount(body) {
  const input = h('input', { class: 'url-field', placeholder: '#4f7cff · rgb(79,124,255) · hsl(226,100%,65%)' });
  const picker = h('input', { type: 'color', class: 'color-picker' });
  const swatch = h('div', { class: 'color-swatch' });
  const error = h('div', { class: 'io-error' });

  const rows = {};
  const outWrap = h('div', { class: 'color-outputs' });
  for (const key of ['HEX', 'RGB', 'HSL']) {
    const val = h('input', { class: 'part-input', readonly: true, spellcheck: 'false' });
    rows[key] = val;
    outWrap.append(h('div', { class: 'color-out-row' }, h('span', { class: 'part-label' }, key), val, copyBtn(() => val.value)));
  }

  const run = (src) => {
    if (!src.trim()) {
      error.textContent = '';
      for (const k in rows) rows[k].value = '';
      swatch.style.background = 'transparent';
      return;
    }
    const rgb = parseColor(src);
    if (!rgb) { error.textContent = 'Unrecognised color. Try #hex, rgb(…), or hsl(…).'; return; }
    error.textContent = '';
    const [r, g, b] = rgb;
    const hex = toHex(r, g, b);
    const [hh, ss, ll] = rgbToHsl(r, g, b);
    rows.HEX.value = hex;
    rows.RGB.value = `rgb(${r}, ${g}, ${b})`;
    rows.HSL.value = `hsl(${hh}, ${ss}%, ${ll}%)`;
    swatch.style.background = hex;
    picker.value = hex;
  };

  input.addEventListener('input', () => run(input.value));
  picker.addEventListener('input', () => { input.value = picker.value; run(picker.value); });

  body.append(
    h('div', { class: 'io-box' },
      h('div', { class: 'io-label' }, 'Color'),
      h('div', { class: 'color-input-row' }, picker, input),
      error,
    ),
    h('div', { class: 'color-preview' }, swatch, outWrap),
  );
  input.focus();
}

// --- Gradient generator ---

const GRADIENT_KINDS = {
  Linear: { css: (stops, angle) => `linear-gradient(${angle}deg, ${stops})`, angleLabel: 'Angle' },
  Radial: { css: (stops) => `radial-gradient(circle at center, ${stops})` },
  Conic: { css: (stops, angle) => `conic-gradient(from ${angle}deg, ${stops})`, angleLabel: 'Start angle' },
};

const randomHex = () => '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');

function gradientMount(body) {
  const kind = h('select', { class: 'select' }, ...Object.keys(GRADIENT_KINDS).map((name) => h('option', {}, name)));
  const angle = h('input', { class: 'slider', type: 'range', min: '0', max: '360', value: '90' });
  const angleValue = h('span', { class: 'kv-value' }, '90°');
  const angleRow = h('label', { class: 'qr-control' }, h('span', { class: 'part-label' }, 'Angle'), angle, angleValue);
  const preview = h('div', { class: 'gradient-preview' });
  const stopList = h('div', { class: 'gradient-stops' });
  const output = h('textarea', { class: 'io-textarea', readonly: true, spellcheck: 'false' });

  // Each stop owns its controls; `render` reads their live values every time.
  const stops = [];

  const cssValue = () => {
    const ordered = [...stops].sort((a, b) => Number(a.position.value) - Number(b.position.value));
    const text = ordered.map((stop) => `${stop.color.value} ${stop.position.value}%`).join(', ');
    return GRADIENT_KINDS[kind.value].css(text, angle.value);
  };

  const render = () => {
    const gradient = cssValue();
    preview.style.background = gradient;
    output.value = `background: ${gradient};`;
    angleRow.hidden = !GRADIENT_KINDS[kind.value].angleLabel;
    angleRow.firstChild.textContent = GRADIENT_KINDS[kind.value].angleLabel ?? 'Angle';
    angleValue.textContent = `${angle.value}°`;
    stopList.querySelectorAll('.gradient-remove').forEach((button) => { button.disabled = stops.length <= 2; });
  };

  function addStop(color = randomHex(), position = 100) {
    const colorField = h('input', { type: 'color', class: 'color-picker', value: color });
    const positionField = h('input', { class: 'slider', type: 'range', min: '0', max: '100', value: String(position) });
    const readout = h('span', { class: 'kv-value' }, `${position}%`);
    const remove = h('button', {
      class: 'btn-icon-sm gradient-remove', type: 'button', 'aria-label': 'Remove this stop', html: icons.trash,
    });

    const row = h('div', { class: 'gradient-stop' }, colorField, positionField, readout, remove);
    const stop = { color: colorField, position: positionField, row };
    stops.push(stop);
    stopList.append(row);

    colorField.addEventListener('input', render);
    positionField.addEventListener('input', () => { readout.textContent = `${positionField.value}%`; render(); });
    remove.addEventListener('click', () => {
      if (stops.length <= 2) return;
      stops.splice(stops.indexOf(stop), 1);
      row.remove();
      render();
    });
    return stop;
  }

  addStop('#4f7cff', 0);
  addStop('#b14fff', 100);

  [kind, angle].forEach((control) => control.addEventListener('input', render));

  body.append(
    preview,
    h('div', { class: 'qr-controls' },
      h('label', { class: 'qr-control' }, h('span', { class: 'part-label' }, 'Type'), kind),
      angleRow,
    ),
    h('div', { class: 'io-box' },
      h('div', { class: 'io-label-row' },
        h('span', { class: 'io-label' }, 'Colour stops'),
        h('div', { class: 'io-actions' },
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => { addStop(); render(); } }, 'Add stop'),
          h('button', {
            class: 'btn btn-ghost btn-sm', type: 'button',
            onClick: () => { stops.forEach((stop) => { stop.color.value = randomHex(); }); render(); },
          }, 'Randomise'),
        ),
      ),
      stopList,
    ),
    h('div', { class: 'io-box' },
      h('div', { class: 'io-label-row' }, h('span', { class: 'io-label' }, 'CSS'), copyBtn(() => output.value)),
      output,
    ),
  );
  render();
}

export default [
  { id: 'color-convert', category: 'Color', name: 'Converter', title: 'Color Converter', desc: 'Convert between HEX, RGB and HSL, with a live swatch and picker.', mount: colorMount },
  {
    id: 'color-gradient', category: 'Color', name: 'Gradient', title: 'CSS Gradient Generator',
    desc: 'Build a linear, radial or conic gradient from any number of colour stops and copy the CSS.',
    mount: gradientMount,
  },
];
