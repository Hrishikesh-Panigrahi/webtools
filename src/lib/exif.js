// TIFF/EXIF tag decoding — the payload found inside a JPEG APP1 segment, a PNG
// eXIf chunk or a WebP EXIF chunk. Container parsing lives in `imagefile.js`;
// this module only understands the TIFF byte layout and the tag dictionary.

const TAG_NAMES = {
  image: {
    0x010e: 'Description', 0x010f: 'Make', 0x0110: 'Model', 0x0112: 'Orientation',
    0x011a: 'X Resolution', 0x011b: 'Y Resolution', 0x0128: 'Resolution Unit',
    0x0131: 'Software', 0x0132: 'Modified', 0x013b: 'Artist', 0x0213: 'YCbCr Positioning',
    0x8298: 'Copyright', 0x0100: 'Image Width', 0x0101: 'Image Height',
  },
  exif: {
    0x829a: 'Exposure Time', 0x829d: 'F Number', 0x8822: 'Exposure Program',
    0x8827: 'ISO', 0x9000: 'Exif Version', 0x9003: 'Taken', 0x9004: 'Digitised',
    0x9201: 'Shutter Speed', 0x9202: 'Aperture', 0x9203: 'Brightness',
    0x9204: 'Exposure Bias', 0x9205: 'Max Aperture', 0x9206: 'Subject Distance',
    0x9207: 'Metering Mode', 0x9208: 'Light Source', 0x9209: 'Flash',
    0x920a: 'Focal Length', 0x927c: 'Maker Note', 0x9286: 'User Comment',
    0xa000: 'FlashPix Version', 0xa001: 'Color Space', 0xa002: 'Pixel X Dimension',
    0xa003: 'Pixel Y Dimension', 0xa402: 'Exposure Mode', 0xa403: 'White Balance',
    0xa404: 'Digital Zoom', 0xa405: 'Focal Length (35mm)', 0xa406: 'Scene Type',
    0xa408: 'Contrast', 0xa409: 'Saturation', 0xa40a: 'Sharpness',
    0xa420: 'Image Unique ID', 0xa430: 'Camera Owner', 0xa431: 'Body Serial',
    0xa432: 'Lens Specification', 0xa433: 'Lens Make', 0xa434: 'Lens Model',
    0xa435: 'Lens Serial',
  },
  gps: {
    0x0000: 'GPS Version', 0x0001: 'Latitude Ref', 0x0002: 'Latitude',
    0x0003: 'Longitude Ref', 0x0004: 'Longitude', 0x0005: 'Altitude Ref',
    0x0006: 'Altitude', 0x0007: 'Timestamp', 0x0008: 'Satellites',
    0x0009: 'Status', 0x000b: 'Precision', 0x000c: 'Speed Ref', 0x000d: 'Speed',
    0x0010: 'Direction Ref', 0x0011: 'Direction', 0x0012: 'Map Datum',
    0x001d: 'Date', 0x001f: 'Position Error',
  },
};

// Enumerated tag values, keyed by the readable tag name.
const ENUMS = {
  Orientation: {
    1: 'Normal', 2: 'Mirrored', 3: 'Rotated 180°', 4: 'Mirrored, 180°',
    5: 'Mirrored, 270° CW', 6: 'Rotated 90° CW', 7: 'Mirrored, 90° CW', 8: 'Rotated 270° CW',
  },
  'Resolution Unit': { 1: 'None', 2: 'Inches', 3: 'Centimetres' },
  'Exposure Program': {
    0: 'Not defined', 1: 'Manual', 2: 'Normal', 3: 'Aperture priority',
    4: 'Shutter priority', 5: 'Creative', 6: 'Action', 7: 'Portrait', 8: 'Landscape',
  },
  'Metering Mode': {
    0: 'Unknown', 1: 'Average', 2: 'Center-weighted', 3: 'Spot', 4: 'Multi-spot',
    5: 'Pattern', 6: 'Partial', 255: 'Other',
  },
  'Light Source': { 0: 'Unknown', 1: 'Daylight', 2: 'Fluorescent', 3: 'Tungsten', 4: 'Flash', 9: 'Fine weather', 10: 'Cloudy', 11: 'Shade' },
  'Color Space': { 1: 'sRGB', 2: 'Adobe RGB', 0xffff: 'Uncalibrated' },
  'Exposure Mode': { 0: 'Auto', 1: 'Manual', 2: 'Auto bracket' },
  'White Balance': { 0: 'Auto', 1: 'Manual' },
  Contrast: { 0: 'Normal', 1: 'Soft', 2: 'Hard' },
  Saturation: { 0: 'Normal', 1: 'Low', 2: 'High' },
  Sharpness: { 0: 'Normal', 1: 'Soft', 2: 'Hard' },
  'Scene Type': { 1: 'Directly photographed' },
  'YCbCr Positioning': { 1: 'Centered', 2: 'Co-sited' },
  'Altitude Ref': { 0: 'Above sea level', 1: 'Below sea level' },
};

// Bytes per TIFF value, indexed by the type code stored in each entry.
const TYPE_SIZES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

function readValue(view, offset, type, littleEndian) {
  switch (type) {
    case 1: case 7: return view.getUint8(offset);
    case 2: return view.getUint8(offset);
    case 3: return view.getUint16(offset, littleEndian);
    case 4: return view.getUint32(offset, littleEndian);
    case 5: return [view.getUint32(offset, littleEndian), view.getUint32(offset + 4, littleEndian)];
    case 6: return view.getInt8(offset);
    case 8: return view.getInt16(offset, littleEndian);
    case 9: return view.getInt32(offset, littleEndian);
    case 10: return [view.getInt32(offset, littleEndian), view.getInt32(offset + 4, littleEndian)];
    case 11: return view.getFloat32(offset, littleEndian);
    case 12: return view.getFloat64(offset, littleEndian);
    default: return null;
  }
}

const ratioToNumber = ([numerator, denominator]) => (denominator === 0 ? 0 : numerator / denominator);

/** Read one IFD entry's values, following the offset when they don't fit inline. */
function readEntry(view, entryOffset, tiffStart, littleEndian) {
  const tag = view.getUint16(entryOffset, littleEndian);
  const type = view.getUint16(entryOffset + 2, littleEndian);
  const count = view.getUint32(entryOffset + 4, littleEndian);
  const size = TYPE_SIZES[type];
  if (!size) return null;

  const totalBytes = size * count;
  const valueOffset = totalBytes <= 4 ? entryOffset + 8 : tiffStart + view.getUint32(entryOffset + 8, littleEndian);
  if (valueOffset + totalBytes > view.byteLength) return null;

  if (type === 2) {
    let text = '';
    for (let i = 0; i < count; i++) {
      const code = view.getUint8(valueOffset + i);
      if (code === 0) break;
      text += String.fromCharCode(code);
    }
    return { tag, type, count, value: text.trim() };
  }

  const values = [];
  for (let i = 0; i < count && i < 64; i++) values.push(readValue(view, valueOffset + i * size, type, littleEndian));
  return { tag, type, count, value: count === 1 ? values[0] : values };
}

// ---------- Human-readable formatting ----------

function formatExposureTime(seconds) {
  if (seconds >= 1) return `${Number(seconds.toFixed(2))} s`;
  return `1/${Math.round(1 / seconds)} s`;
}

// Bits 3-4 hold the firing mode; bit 0 says whether it actually went off.
const FLASH_MODES = { 1: 'forced on', 2: 'forced off', 3: 'auto' };

function formatFlash(bits) {
  if (typeof bits !== 'number') return String(bits);
  const parts = [(bits & 1) === 1 ? 'Fired' : 'Did not fire'];
  if ((bits & 0b100000) !== 0) parts.push('no flash function');
  else if (FLASH_MODES[(bits >> 3) & 0b11]) parts.push(FLASH_MODES[(bits >> 3) & 0b11]);
  if ((bits & 0b1000000) !== 0) parts.push('red-eye reduction');
  return parts.join(', ');
}

// EXIF writes timestamps as "2026:08:13 10:30:00"; only the date half uses colons.
const normalizeDate = (text) => text.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');

const DATE_TAGS = new Set(['Taken', 'Digitised', 'Modified', 'Date']);

const COORDINATE_TAGS = new Set(['Latitude', 'Longitude']);

/** Turn a raw tag value into the string a person wants to read. */
function formatTag(name, value, type) {
  if (value === null || value === undefined) return '';
  if (type === 5 || type === 10) {
    const numbers = Array.isArray(value[0]) ? value.map(ratioToNumber) : [ratioToNumber(value)];
    const single = numbers[0];
    if (COORDINATE_TAGS.has(name) && numbers.length === 3) {
      const [degrees, minutes, seconds] = numbers;
      return `${Math.trunc(degrees)}° ${Math.trunc(minutes)}′ ${seconds.toFixed(2)}″`;
    }
    if (name === 'Exposure Time' && single > 0) return formatExposureTime(single);
    if (name === 'F Number' || name === 'Max Aperture') return `f/${Number(single.toFixed(1))}`;
    if (name === 'Focal Length') return `${Number(single.toFixed(1))} mm`;
    if (name === 'Altitude') return `${Number(single.toFixed(1))} m`;
    if (name === 'Speed') return Number(single.toFixed(2)).toString();
    if (name === 'Exposure Bias') return `${single > 0 ? '+' : ''}${Number(single.toFixed(2))} EV`;
    if (name === 'Digital Zoom') return single === 0 ? 'None' : `${Number(single.toFixed(2))}×`;
    return numbers.map((n) => Number(n.toFixed(4))).join(', ');
  }
  if (ENUMS[name]?.[value] !== undefined) return ENUMS[name][value];
  if (name === 'Flash') return formatFlash(value);
  if (name === 'Focal Length (35mm)') return `${value} mm`;
  if (name === 'Exif Version' || name === 'FlashPix Version') {
    return Array.isArray(value) ? String.fromCharCode(...value) : String(value);
  }
  if (DATE_TAGS.has(name) && typeof value === 'string') return normalizeDate(value);
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

// ---------- GPS ----------

/** Degrees/minutes/seconds triple plus a N/S/E/W reference to a signed decimal. */
function coordinateToDecimal(parts, reference) {
  if (!Array.isArray(parts) || parts.length < 3) return null;
  const [degrees, minutes, seconds] = parts.map(ratioToNumber);
  const decimal = degrees + minutes / 60 + seconds / 3600;
  return /^[SW]$/i.test(reference || '') ? -decimal : decimal;
}

const formatDms = (parts, reference) => {
  const [degrees, minutes, seconds] = parts.map(ratioToNumber);
  return `${Math.trunc(degrees)}° ${Math.trunc(minutes)}′ ${seconds.toFixed(2)}″ ${reference || ''}`.trim();
};

function buildLocation(rawGps) {
  const latitude = coordinateToDecimal(rawGps[0x0002], rawGps[0x0001]);
  const longitude = coordinateToDecimal(rawGps[0x0004], rawGps[0x0003]);
  if (latitude === null || longitude === null) return null;

  const altitudeRatio = rawGps[0x0006];
  const altitude = Array.isArray(altitudeRatio)
    ? ratioToNumber(altitudeRatio) * (rawGps[0x0005] === 1 ? -1 : 1)
    : null;

  return {
    latitude,
    longitude,
    altitude,
    decimal: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
    dms: `${formatDms(rawGps[0x0002], rawGps[0x0001])}, ${formatDms(rawGps[0x0004], rawGps[0x0003])}`,
    mapUrl: `https://www.openstreetmap.org/?mlat=${latitude.toFixed(6)}&mlon=${longitude.toFixed(6)}#map=16/${latitude.toFixed(4)}/${longitude.toFixed(4)}`,
  };
}

// ---------- IFD walking ----------

const SUB_IFD_TAGS = { 0x8769: 'exif', 0x8825: 'gps' };

function readIfd(view, ifdOffset, tiffStart, littleEndian) {
  if (ifdOffset + 2 > view.byteLength) return { entries: [], next: 0 };
  const count = view.getUint16(ifdOffset, littleEndian);
  const entries = [];
  for (let i = 0; i < count; i++) {
    const entryOffset = ifdOffset + 2 + i * 12;
    if (entryOffset + 12 > view.byteLength) break;
    const entry = readEntry(view, entryOffset, tiffStart, littleEndian);
    if (entry) entries.push(entry);
  }
  const nextOffset = ifdOffset + 2 + count * 12;
  const next = nextOffset + 4 <= view.byteLength ? view.getUint32(nextOffset, littleEndian) : 0;
  return { entries, next };
}

/**
 * Decode a TIFF block into readable tag groups plus a resolved GPS location.
 *
 * @param {ArrayBuffer|Uint8Array} buffer  the bytes containing the TIFF header
 * @param {number} [tiffStart]             where "II"/"MM" begins inside them
 * @returns {{ groups: Array<{name:string, tags:Array<{name:string,value:string}>}>, location:Object|null }}
 */
export function parseTiff(buffer, tiffStart = 0) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (tiffStart + 8 > view.byteLength) throw new Error('EXIF block is truncated.');

  const byteOrder = view.getUint16(tiffStart, false);
  if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) throw new Error('Not a TIFF header.');
  const littleEndian = byteOrder === 0x4949;
  if (view.getUint16(tiffStart + 2, littleEndian) !== 42) throw new Error('Bad TIFF magic number.');

  const collected = { image: [], exif: [], gps: [], thumbnail: [] };
  const rawGps = {};
  let pointer = tiffStart + view.getUint32(tiffStart + 4, littleEndian);

  const walk = (offset, group) => {
    const { entries, next } = readIfd(view, offset, tiffStart, littleEndian);
    for (const entry of entries) {
      const subGroup = SUB_IFD_TAGS[entry.tag];
      if (subGroup) { walk(tiffStart + entry.value, subGroup); continue; }
      if (group === 'gps') rawGps[entry.tag] = entry.value;
      const name = TAG_NAMES[group === 'thumbnail' ? 'image' : group]?.[entry.tag];
      if (!name || entry.tag === 0x927c) continue; // maker notes are vendor binary
      collected[group].push({ name, value: formatTag(name, entry.value, entry.type) });
    }
    return next;
  };

  const nextIfd = walk(pointer, 'image');
  if (nextIfd) walk(tiffStart + nextIfd, 'thumbnail');

  const GROUP_LABELS = { image: 'Image', exif: 'Camera & exposure', gps: 'Location', thumbnail: 'Thumbnail' };
  const groups = Object.entries(collected)
    .filter(([, tags]) => tags.length)
    .map(([key, tags]) => ({ name: GROUP_LABELS[key], tags }));

  return { groups, location: buildLocation(rawGps) };
}
