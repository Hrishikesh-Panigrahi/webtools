import { h, copyBtn } from '../dom.js';
import { filePicker } from '../panel.js';
import { inspectImage, stripImageMetadata, detectFormat } from '../imagefile.js';
import { formatBytes, formatDelta } from '../format.js';

const readArrayBuffer = (file) => file.arrayBuffer();

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = h('a', { href: url, download: filename });
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * An <img> that swaps its object URL cleanly each time a new file is shown, and
 * hides its own box when the browser cannot decode what it was given.
 */
function previewImage() {
  const image = h('img', { class: 'image-preview', alt: '' });
  let currentUrl = null;
  const box = h('div', { class: 'io-box preview-box', hidden: true },
    h('div', { class: 'io-label' }, 'Preview'), image);

  image.addEventListener('error', () => { box.hidden = true; });

  return {
    box,
    setLabel(text) { box.firstChild.textContent = text; },
    show(blob) {
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      currentUrl = URL.createObjectURL(blob);
      box.hidden = false;
      image.src = currentUrl;
    },
    hide() { box.hidden = true; },
  };
}

const statTile = (label, value) => h('div', { class: 'stat' },
  h('div', { class: 'stat-value' }, value),
  h('div', { class: 'stat-label' }, label));

const tagRow = (name, value) => h('div', { class: 'kv-row' },
  h('span', { class: 'kv-label' }, name),
  h('span', { class: 'kv-value' }, value || '—'));

// --- EXIF viewer ---

function locationCard(location) {
  const fields = [
    ['Decimal', location.decimal],
    ['DMS', location.dms],
    ['Altitude', location.altitude === null ? '—' : `${location.altitude.toFixed(1)} m`],
  ];
  return h('div', { class: 'io-box gps-card' },
    h('div', { class: 'io-label-row' },
      h('span', { class: 'io-label' }, 'Location'),
      copyBtn(() => location.decimal),
    ),
    h('div', { class: 'kv-list' }, ...fields.map(([name, value]) => tagRow(name, value))),
    h('a', { class: 'gps-link', href: location.mapUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Open in OpenStreetMap ↗'),
  );
}

function exifMount(body) {
  const results = h('div', { class: 'meta-results' });
  const error = h('div', { class: 'io-error' });
  const preview = previewImage();
  preview.setLabel('Image');

  let report = null;
  // Reading a file is async, so a slower earlier drop must not overwrite a newer one.
  let latestLoad = 0;

  const asJson = () => (report
    ? JSON.stringify(Object.fromEntries(report.groups.map((group) => [
      group.name, Object.fromEntries(group.tags.map((tag) => [tag.name, tag.value])),
    ])), null, 2)
    : '');

  const render = (file) => {
    results.innerHTML = '';
    if (!report) return;

    results.append(h('div', { class: 'stat-grid' },
      statTile('Format', report.format.toUpperCase()),
      statTile('Dimensions', report.width ? `${report.width} × ${report.height}` : '—'),
      statTile('File size', formatBytes(file.size)),
      statTile('Metadata tags', String(report.groups.reduce((sum, group) => sum + group.tags.length, 0))),
    ));

    if (report.location) results.append(locationCard(report.location));

    if (!report.groups.length) {
      results.append(h('p', { class: 'tool-hint' }, 'No metadata in this file.'));
      return;
    }

    const grid = h('div', { class: 'meta-groups' });
    for (const group of report.groups) {
      grid.append(h('div', { class: 'io-box' },
        h('div', { class: 'io-label' }, group.name),
        h('div', { class: 'kv-list' }, ...group.tags.map((tag) => tagRow(tag.name, tag.value))),
      ));
    }
    results.append(grid, h('div', { class: 'tool-actions' },
      h('span', { class: 'kbd-hint' }, 'All tags as JSON'),
      copyBtn(asJson),
    ));
  };

  const picker = filePicker({
    accept: 'image/*',
    hint: 'Drop a photo here, or click to choose. JPEG, PNG or WebP.',
    onFile: async (file) => {
      const request = ++latestLoad;
      error.textContent = '';
      results.innerHTML = '';
      report = null;
      preview.show(file);

      let bytes;
      try {
        bytes = await readArrayBuffer(file);
      } catch {
        if (request === latestLoad) error.textContent = 'That file could not be read.';
        return;
      }
      if (request !== latestLoad) return; // superseded by a newer file

      try {
        report = inspectImage(bytes);
      } catch (failure) {
        error.textContent = failure.message;
        return;
      }
      render(file);
    },
  });

  body.append(picker, error, preview.box, results);
}

// --- Metadata cleaner ---

function cleanerMount(body) {
  const error = h('div', { class: 'io-error' });
  const summary = h('div', { class: 'meta-results' });
  const preview = previewImage();
  preview.setLabel('Cleaned image');
  // Reading a file is async, so a slower earlier drop must not overwrite a newer one.
  let latestLoad = 0;

  const picker = filePicker({
    accept: 'image/jpeg,image/png,image/webp',
    hint: 'Drop a photo here to strip its metadata. JPEG, PNG or WebP.',
    onFile: async (file) => {
      const request = ++latestLoad;
      error.textContent = '';
      summary.innerHTML = '';
      preview.hide();

      let result;
      try {
        const bytes = await readArrayBuffer(file);
        if (request !== latestLoad) return; // superseded by a newer file
        result = stripImageMetadata(bytes);
      } catch (failure) {
        if (request === latestLoad) error.textContent = failure.message;
        return;
      }

      const cleaned = new Blob([result.bytes], { type: file.type || `image/${result.format}` });
      preview.show(cleaned);

      const saved = file.size - cleaned.size;
      summary.append(h('div', { class: 'stat-grid' },
        statTile('Original', formatBytes(file.size)),
        statTile('Cleaned', formatBytes(cleaned.size)),
        statTile('Removed', formatBytes(saved)),
        statTile('Change', formatDelta(file.size, cleaned.size)),
      ));

      summary.append(result.removed.length
        ? h('div', { class: 'io-box' },
            h('div', { class: 'io-label' }, `Removed ${result.removed.length} block${result.removed.length === 1 ? '' : 's'}`),
            h('div', { class: 'kv-list' }, ...result.removed.map((block) => tagRow(block.name, formatBytes(block.bytes)))))
        : h('p', { class: 'tool-hint' }, 'This file had no metadata to remove.'));

      const stem = file.name.replace(/\.[^.]+$/, '');
      summary.append(h('div', { class: 'tool-actions' },
        h('button', {
          class: 'btn btn-primary', type: 'button',
          onClick: () => download(cleaned, `${stem}-clean.${result.format === 'jpeg' ? 'jpg' : result.format}`),
        }, 'Download cleaned image'),
      ));
    },
  });

  body.append(
    picker,
    error,
    h('p', { class: 'tool-hint' }, 'Image data is copied as-is, so nothing is re-compressed. Drops EXIF, GPS, XMP, IPTC, comments and timestamps. Keeps the color profile.'),
    summary,
    preview.box,
  );
}

// --- Format converter ---

const OUTPUT_TYPES = { PNG: 'image/png', JPEG: 'image/jpeg', WebP: 'image/webp' };

/** Fit within a bounding box without enlarging or changing the aspect ratio. */
function fitWithin(width, height, limit) {
  if (!limit || (width <= limit && height <= limit)) return { width, height };
  const ratio = Math.min(limit / width, limit / height);
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}

function converterMount(body) {
  const target = h('select', { class: 'select' }, ...Object.keys(OUTPUT_TYPES).map((name) => h('option', {}, name)));
  const quality = h('input', { class: 'slider', type: 'range', min: '10', max: '100', value: '85' });
  const qualityValue = h('span', { class: 'kv-value' }, '85%');
  const maxSide = h('input', { class: 'part-input', type: 'number', min: '0', step: '10', placeholder: 'no limit' });
  const error = h('div', { class: 'io-error' });
  const summary = h('div', { class: 'meta-results' });
  const preview = previewImage();
  preview.setLabel('Result');

  let source = null;
  let sourceFile = null;
  // Both loading a file and encoding one are async, so a slow earlier request
  // can finish after a newer one. Each takes a ticket and drops out if beaten.
  let latestLoad = 0;
  let latestRender = 0;

  const qualityRow = h('label', { class: 'qr-control' },
    h('span', { class: 'part-label' }, 'Quality'), quality, qualityValue);

  const convert = async () => {
    if (!source) return;
    const request = ++latestRender;
    error.textContent = '';
    const type = OUTPUT_TYPES[target.value];
    qualityRow.hidden = type === 'image/png';
    // Capture the file this run describes; a newer drop must not relabel it.
    const file = sourceFile;

    const limit = Number(maxSide.value) || 0;
    const { width, height } = fitWithin(source.width, source.height, limit);

    const canvas = h('canvas', { width, height });
    const context = canvas.getContext('2d');
    context.imageSmoothingQuality = 'high';
    // JPEG has no alpha; without a white base, transparency renders as black.
    if (type === 'image/jpeg') {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(source, 0, 0, width, height);

    const sourceWidth = source.width;
    const sourceHeight = source.height;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, Number(quality.value) / 100));
    if (request !== latestRender) return; // a newer setting or file already won
    if (!blob) { error.textContent = `This browser cannot write ${target.value}.`; return; }

    preview.show(blob);
    summary.innerHTML = '';
    summary.append(h('div', { class: 'stat-grid' },
      statTile('Source', `${sourceWidth} × ${sourceHeight}`),
      statTile('Output', `${width} × ${height}`),
      statTile('Size', `${formatBytes(file.size)} → ${formatBytes(blob.size)}`),
      statTile('Change', formatDelta(file.size, blob.size)),
    ));

    const stem = file.name.replace(/\.[^.]+$/, '');
    const extension = target.value === 'JPEG' ? 'jpg' : target.value.toLowerCase();
    summary.append(h('div', { class: 'tool-actions' },
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => download(blob, `${stem}.${extension}`),
      }, `Download ${target.value}`),
    ));
  };

  const picker = filePicker({
    accept: 'image/*',
    hint: 'Drop an image here, or click to choose',
    onFile: async (file) => {
      const request = ++latestLoad;
      error.textContent = '';

      let bitmap;
      let bytes;
      try {
        // Bake in the EXIF rotation rather than relying on a tag the output may not carry.
        [bitmap, bytes] = await Promise.all([
          createImageBitmap(file, { imageOrientation: 'from-image' }),
          readArrayBuffer(file),
        ]);
      } catch {
        if (request !== latestLoad) return;
        error.textContent = 'This browser could not decode that image.';
        source = null;
        return;
      }
      // Drop a slower load that a newer file has already superseded, or the
      // stats would describe one image and the bitmap would be another.
      if (request !== latestLoad) { bitmap.close?.(); return; }

      source = bitmap;
      sourceFile = file;
      // Default to a format other than the input's, since converting to itself is rarely the point.
      target.value = detectFormat(new Uint8Array(bytes)) === 'webp' ? 'PNG' : 'WebP';
      convert();
    },
  });

  quality.addEventListener('input', () => { qualityValue.textContent = `${quality.value}%`; convert(); });
  [target, maxSide].forEach((control) => control.addEventListener('input', convert));

  body.append(
    picker,
    error,
    h('div', { class: 'qr-controls' },
      h('label', { class: 'qr-control' }, h('span', { class: 'part-label' }, 'Convert to'), target),
      qualityRow,
      h('label', { class: 'qr-control' }, h('span', { class: 'part-label' }, 'Max width/height'), maxSide),
    ),
    summary,
    preview.box,
    h('p', { class: 'tool-hint' }, 'Re-encoding removes all metadata, including GPS, and applies any EXIF rotation. Resizing caps the longest side and never enlarges.'),
  );
}

export default [
  {
    id: 'image-exif', category: 'Image', name: 'EXIF Viewer', title: 'Image Metadata Viewer',
    desc: 'See the EXIF, GPS and XMP metadata stored in a photo.',
    mount: exifMount,
  },
  {
    id: 'image-clean', category: 'Image', name: 'Metadata Cleaner', title: 'Image Metadata Cleaner',
    desc: 'Remove EXIF, GPS and other metadata from a photo, without re-encoding it.',
    mount: cleanerMount,
  },
  {
    id: 'image-convert', category: 'Image', name: 'Format Converter', title: 'Image Format Converter',
    desc: 'Convert between PNG, JPEG and WebP. Resize and set quality if you need to.',
    mount: converterMount,
  },
];
