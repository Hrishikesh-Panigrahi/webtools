// Image container parsing: walk a JPEG's segments, a PNG's chunks or a WebP's
// RIFF chunks without decoding any pixels. Used to read metadata out of a photo
// and to write the same photo back with the metadata removed — losslessly, since
// the image data is copied through byte for byte.

import { parseTiff } from './exif.js';

const ascii = (bytes, start, length) => String.fromCharCode(...bytes.subarray(start, start + length));

const startsWith = (bytes, signature) => signature.every((byte, index) => bytes[index] === byte);

export function detectFormat(bytes) {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return 'png';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'webp';
  if (ascii(bytes, 0, 3) === 'GIF') return 'gif';
  if (ascii(bytes, 4, 4) === 'ftyp') return 'heif';
  return null;
}

// ---------- JPEG ----------

// Markers that carry no length field, so the parser must not read one.
const JPEG_STANDALONE = new Set([0x01, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9]);

// APP0 (JFIF), APP2 (ICC profile) and APP14 (Adobe color transform) affect how
// the image renders, so a privacy strip keeps them. Everything else in the
// APPn/COM range is descriptive and gets dropped.
const JPEG_KEEP_APPS = new Set([0xe0, 0xe2, 0xee]);
const isJpegMetadata = (marker) => (marker >= 0xe1 && marker <= 0xef && !JPEG_KEEP_APPS.has(marker)) || marker === 0xfe;

const JPEG_SEGMENT_NAMES = {
  0xe0: 'JFIF header', 0xe1: 'EXIF / XMP', 0xe2: 'ICC color profile', 0xe3: 'Kodak metadata',
  0xe4: 'FlashPix', 0xe5: 'Ricoh metadata', 0xe6: 'Vendor metadata', 0xe7: 'Vendor metadata',
  0xe8: 'SPIFF', 0xe9: 'Vendor metadata', 0xea: 'Vendor metadata', 0xeb: 'Vendor metadata',
  0xec: 'Picture info', 0xed: 'Photoshop / IPTC', 0xee: 'Adobe color', 0xef: 'Vendor metadata',
  0xfe: 'Comment',
  0xc0: 'Baseline frame', 0xc1: 'Extended frame', 0xc2: 'Progressive frame',
  0xc4: 'Huffman tables', 0xdb: 'Quantisation tables', 0xdd: 'Restart interval',
  0xda: 'Scan header',
};

// Start-of-frame markers hold the dimensions; DHT/JPG/DAC share the range but not the layout.
const isStartOfFrame = (marker) => marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);

/** Split a JPEG into segments. Entropy-coded scan data is one final block. */
function walkJpeg(bytes) {
  const segments = [];
  let offset = 2; // past SOI
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    if (JPEG_STANDALONE.has(marker)) { offset += 2; continue; }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2) break;
    const end = offset + 2 + length;
    segments.push({
      marker,
      name: JPEG_SEGMENT_NAMES[marker] || `Marker ${marker.toString(16).toUpperCase()}`,
      start: offset,
      end,
      dataStart: offset + 4,
      isMetadata: isJpegMetadata(marker),
    });
    if (marker === 0xda) return { segments, scanStart: end }; // scan data runs to EOI
    offset = end;
  }
  return { segments, scanStart: bytes.length };
}

const EXIF_PREFIX = 'Exif\0\0';
const XMP_PREFIX = 'http://ns.adobe.com/xap/1.0/\0';

function jpegDimensions(bytes, segments) {
  const frame = segments.find((segment) => isStartOfFrame(segment.marker));
  if (!frame) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { height: view.getUint16(frame.dataStart + 1), width: view.getUint16(frame.dataStart + 3) };
}

// ---------- PNG ----------

const PNG_METADATA_CHUNKS = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME', 'dSIG']);

const PNG_CHUNK_NAMES = {
  tEXt: 'Text comment', zTXt: 'Compressed text', iTXt: 'International text',
  eXIf: 'EXIF block', tIME: 'Last-modified time', dSIG: 'Digital signature',
  iCCP: 'ICC color profile', pHYs: 'Pixel dimensions',
};

function walkPng(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks = [];
  let offset = 8; // past the signature
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = ascii(bytes, offset + 4, 4);
    const end = offset + 12 + length;
    if (end > bytes.length) break;
    chunks.push({
      type,
      name: PNG_CHUNK_NAMES[type] || `${type} chunk`,
      start: offset,
      end,
      dataStart: offset + 8,
      dataEnd: offset + 8 + length,
      isMetadata: PNG_METADATA_CHUNKS.has(type),
    });
    if (type === 'IEND') break;
    offset = end;
  }
  return chunks;
}

/** PNG text chunks are `keyword\0value`; iTXt adds language fields we skip past. */
function readPngText(bytes, chunk) {
  const raw = bytes.subarray(chunk.dataStart, chunk.dataEnd);
  const separator = raw.indexOf(0);
  if (separator < 0) return null;
  const keyword = ascii(raw, 0, separator);
  if (chunk.type === 'zTXt') return { name: keyword, value: '(compressed)' };
  if (chunk.type === 'iTXt') {
    // keyword \0 compressionFlag compressionMethod language \0 translated \0 text
    let cursor = separator + 3;
    for (let skipped = 0; skipped < 2 && cursor < raw.length; skipped++) cursor = raw.indexOf(0, cursor) + 1;
    return { name: keyword, value: new TextDecoder().decode(raw.subarray(cursor)) };
  }
  return { name: keyword, value: new TextDecoder().decode(raw.subarray(separator + 1)) };
}

// ---------- WebP ----------

const WEBP_METADATA_CHUNKS = new Set(['EXIF', 'XMP ']);
const WEBP_CHUNK_NAMES = { EXIF: 'EXIF block', 'XMP ': 'XMP metadata', ICCP: 'ICC color profile', VP8X: 'Extended header' };

function walkWebp(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks = [];
  let offset = 12; // past 'RIFF' + size + 'WEBP'
  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, 4);
    const length = view.getUint32(offset + 4, true);
    const padded = length + (length % 2); // chunks are padded to an even size
    chunks.push({
      type,
      name: WEBP_CHUNK_NAMES[type] || `${type} chunk`,
      start: offset,
      end: Math.min(offset + 8 + padded, bytes.length),
      dataStart: offset + 8,
      dataEnd: offset + 8 + length,
      isMetadata: WEBP_METADATA_CHUNKS.has(type),
    });
    offset += 8 + padded;
  }
  return chunks;
}

function webpDimensions(bytes, chunks) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const extended = chunks.find((chunk) => chunk.type === 'VP8X');
  if (extended) {
    const read24 = (at) => bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16);
    return { width: read24(extended.dataStart + 4) + 1, height: read24(extended.dataStart + 7) + 1 };
  }
  const lossy = chunks.find((chunk) => chunk.type === 'VP8 ');
  if (lossy) {
    const at = lossy.dataStart + 6; // past the frame tag and sync code
    return { width: view.getUint16(at, true) & 0x3fff, height: view.getUint16(at + 2, true) & 0x3fff };
  }
  const lossless = chunks.find((chunk) => chunk.type === 'VP8L');
  if (lossless) {
    const packed = view.getUint32(lossless.dataStart + 1, true);
    return { width: (packed & 0x3fff) + 1, height: ((packed >> 14) & 0x3fff) + 1 };
  }
  return null;
}

// ---------- Reading ----------

const pngDimensions = (bytes, chunks) => {
  const header = chunks.find((chunk) => chunk.type === 'IHDR');
  if (!header) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(header.dataStart), height: view.getUint32(header.dataStart + 4) };
};

/** Locate the TIFF block a container stores EXIF in, and decode it. */
function decodeExif(bytes, block) {
  try {
    return parseTiff(bytes.subarray(block.start, block.end), block.tiffOffset);
  } catch {
    return null;
  }
}

/**
 * Inspect an image without decoding it.
 *
 * @param {ArrayBuffer} buffer
 * @returns {{format:string, width:number|null, height:number|null,
 *            groups:Array, location:Object|null, blocks:Array<{name:string,bytes:number,isMetadata:boolean}>}}
 */
export function inspectImage(buffer) {
  const bytes = new Uint8Array(buffer);
  const format = detectFormat(bytes);
  if (!format) throw new Error('Unrecognised image format.');
  if (format === 'gif' || format === 'heif') {
    throw new Error(`${format.toUpperCase()} files are not supported yet. Try JPEG, PNG or WebP.`);
  }

  let parts = [];
  let size = null;
  let exif = null;
  const extraGroups = [];

  if (format === 'jpeg') {
    const { segments } = walkJpeg(bytes);
    parts = segments;
    size = jpegDimensions(bytes, segments);
    for (const segment of segments) {
      if (segment.marker !== 0xe1) continue;
      const header = ascii(bytes, segment.dataStart, 6);
      if (header === EXIF_PREFIX) {
        exif = decodeExif(bytes, { start: segment.dataStart + 6, end: segment.end, tiffOffset: 0 });
      } else if (ascii(bytes, segment.dataStart, XMP_PREFIX.length) === XMP_PREFIX) {
        extraGroups.push({ name: 'XMP', tags: [{ name: 'Packet', value: `${segment.end - segment.dataStart} bytes of XMP/RDF` }] });
      }
    }
  } else if (format === 'png') {
    parts = walkPng(bytes);
    size = pngDimensions(bytes, parts);
    const textTags = [];
    for (const chunk of parts) {
      if (chunk.type === 'eXIf') exif = decodeExif(bytes, { start: chunk.dataStart, end: chunk.dataEnd, tiffOffset: 0 });
      else if (PNG_METADATA_CHUNKS.has(chunk.type) && chunk.type !== 'tIME') {
        const text = readPngText(bytes, chunk);
        if (text) textTags.push(text);
      } else if (chunk.type === 'tIME') {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const [year, month, day, hour, minute, second] = [
          view.getUint16(chunk.dataStart), bytes[chunk.dataStart + 2], bytes[chunk.dataStart + 3],
          bytes[chunk.dataStart + 4], bytes[chunk.dataStart + 5], bytes[chunk.dataStart + 6],
        ];
        const pad = (n) => String(n).padStart(2, '0');
        textTags.push({ name: 'Modified', value: `${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}:${pad(second)} UTC` });
      }
    }
    if (textTags.length) extraGroups.push({ name: 'PNG text', tags: textTags });
  } else {
    parts = walkWebp(bytes);
    size = webpDimensions(bytes, parts);
    for (const chunk of parts) {
      if (chunk.type === 'EXIF') exif = decodeExif(bytes, { start: chunk.dataStart, end: chunk.dataEnd, tiffOffset: 0 });
      if (chunk.type === 'XMP ') {
        extraGroups.push({ name: 'XMP', tags: [{ name: 'Packet', value: `${chunk.dataEnd - chunk.dataStart} bytes of XMP/RDF` }] });
      }
    }
  }

  return {
    format,
    width: size?.width ?? null,
    height: size?.height ?? null,
    groups: [...(exif?.groups ?? []), ...extraGroups],
    location: exif?.location ?? null,
    blocks: parts.map((part) => ({ name: part.name, bytes: part.end - part.start, isMetadata: part.isMetadata })),
  };
}

// ---------- Stripping ----------

const concat = (chunks) => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
};

function stripJpeg(bytes) {
  const { segments, scanStart } = walkJpeg(bytes);
  const removed = [];
  const kept = [bytes.subarray(0, 2)];
  for (const segment of segments) {
    if (segment.isMetadata) { removed.push({ name: segment.name, bytes: segment.end - segment.start }); continue; }
    kept.push(bytes.subarray(segment.start, segment.end));
  }
  kept.push(bytes.subarray(scanStart));
  return { bytes: concat(kept), removed };
}

function stripPng(bytes) {
  const chunks = walkPng(bytes);
  const removed = [];
  const kept = [bytes.subarray(0, 8)];
  for (const chunk of chunks) {
    if (chunk.isMetadata) { removed.push({ name: chunk.name, bytes: chunk.end - chunk.start }); continue; }
    kept.push(bytes.subarray(chunk.start, chunk.end));
  }
  return { bytes: concat(kept), removed };
}

// The VP8X header advertises which optional chunks follow; those flag bits must
// go too, or decoders will look for metadata that is no longer there.
const VP8X_EXIF_FLAG = 0x08;
const VP8X_XMP_FLAG = 0x04;

function stripWebp(bytes) {
  const chunks = walkWebp(bytes);
  const removed = [];
  const kept = [];
  for (const chunk of chunks) {
    if (chunk.isMetadata) { removed.push({ name: chunk.name, bytes: chunk.end - chunk.start }); continue; }
    const slice = bytes.slice(chunk.start, chunk.end);
    if (chunk.type === 'VP8X') slice[8] &= ~(VP8X_EXIF_FLAG | VP8X_XMP_FLAG);
    kept.push(slice);
  }
  const body = concat(kept);
  const header = bytes.slice(0, 12);
  new DataView(header.buffer).setUint32(4, body.length + 4, true); // 'WEBP' + chunks
  return { bytes: concat([header, body]), removed };
}

/**
 * Remove descriptive metadata while copying the image data through untouched.
 *
 * @param {ArrayBuffer} buffer
 * @returns {{bytes:Uint8Array, removed:Array<{name:string,bytes:number}>, format:string}}
 */
export function stripImageMetadata(buffer) {
  const bytes = new Uint8Array(buffer);
  const format = detectFormat(bytes);
  const strippers = { jpeg: stripJpeg, png: stripPng, webp: stripWebp };
  const strip = strippers[format];
  if (!strip) throw new Error('Only JPEG, PNG and WebP files can be cleaned.');
  return { ...strip(bytes), format };
}
