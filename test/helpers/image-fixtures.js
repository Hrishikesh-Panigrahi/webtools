// Builders for images with known metadata, so the EXIF reader and the metadata
// stripper can be tested against bytes whose exact contents we chose.

const EIFFEL_TOWER = {
  latitude: [[48, 1], [51, 1], [2999, 100]],
  longitude: [[2, 1], [17, 1], [4008, 100]],
};

/** A big-endian TIFF block with IFD0, an Exif sub-IFD and a GPS sub-IFD. */
export function buildExifBlock() {
  const heap = [];
  let heapLength = 0;

  const ascii = (text) => {
    const bytes = Buffer.from(`${text}\0`, 'latin1');
    // Four bytes or fewer live inside the entry, as the spec requires.
    if (bytes.length <= 4) return { type: 2, count: bytes.length, raw: bytes };
    const offset = heapLength;
    heap.push(bytes);
    heapLength += bytes.length;
    return { type: 2, count: bytes.length, offset };
  };
  const rationals = (pairs) => {
    const bytes = Buffer.alloc(pairs.length * 8);
    pairs.forEach(([numerator, denominator], index) => {
      bytes.writeUInt32BE(numerator, index * 8);
      bytes.writeUInt32BE(denominator, index * 8 + 4);
    });
    const offset = heapLength;
    heap.push(bytes);
    heapLength += bytes.length;
    return { type: 5, count: pairs.length, offset };
  };
  const short = (value) => ({ type: 3, count: 1, inline: value });
  const byte = (value) => ({ type: 1, count: 1, inline: value });

  const imageEntries = [
    [0x010f, ascii('Canon')],
    [0x0110, ascii('Canon EOS R6')],
    [0x0112, short(6)],
    [0x0131, ascii('webTools fixture')],
    [0x0132, ascii('2026:08:13 10:30:00')],
  ];
  const exifEntries = [
    [0x829a, rationals([[1, 250]])],
    [0x829d, rationals([[28, 10]])],
    [0x8827, short(400)],
    [0x920a, rationals([[85, 1]])],
    [0x9003, ascii('2026:08:13 10:30:00')],
    [0x9209, short(9)],
    [0xa434, ascii('RF85mm F1.2 L USM')],
  ];
  const gpsEntries = [
    [0x0001, ascii('N')],
    [0x0002, rationals(EIFFEL_TOWER.latitude)],
    [0x0003, ascii('E')],
    [0x0004, rationals(EIFFEL_TOWER.longitude)],
    [0x0005, byte(0)],
    [0x0006, rationals([[35, 1]])],
  ];

  const ifdBytes = (entryCount) => 2 + entryCount * 12 + 4;
  const imageStart = 8;
  const exifStart = imageStart + ifdBytes(imageEntries.length + 2); // + the two sub-IFD pointers
  const gpsStart = exifStart + ifdBytes(exifEntries.length);
  const heapStart = gpsStart + ifdBytes(gpsEntries.length);

  const buffer = Buffer.alloc(heapStart + heapLength);
  buffer.write('MM', 0, 'latin1');
  buffer.writeUInt16BE(42, 2);
  buffer.writeUInt32BE(imageStart, 4);

  const writeIfd = (entries, start) => {
    buffer.writeUInt16BE(entries.length, start);
    entries.forEach(([tag, field], index) => {
      const at = start + 2 + index * 12;
      buffer.writeUInt16BE(tag, at);
      buffer.writeUInt16BE(field.type, at + 2);
      buffer.writeUInt32BE(field.count, at + 4);
      if (field.raw !== undefined) field.raw.copy(buffer, at + 8);
      else if (field.type === 3 && field.inline !== undefined) buffer.writeUInt16BE(field.inline, at + 8);
      else if (field.type === 1 && field.inline !== undefined) buffer.writeUInt8(field.inline, at + 8);
      else if (field.absolute !== undefined) buffer.writeUInt32BE(field.absolute, at + 8);
      else buffer.writeUInt32BE(heapStart + field.offset, at + 8);
    });
    buffer.writeUInt32BE(0, start + 2 + entries.length * 12);
  };

  writeIfd([
    ...imageEntries,
    [0x8769, { type: 4, count: 1, absolute: exifStart }],
    [0x8825, { type: 4, count: 1, absolute: gpsStart }],
  ], imageStart);
  writeIfd(exifEntries, exifStart);
  writeIfd(gpsEntries, gpsStart);

  let cursor = heapStart;
  for (const bytes of heap) { bytes.copy(buffer, cursor); cursor += bytes.length; }
  return buffer;
}

const jpegSegment = (marker, payload) => {
  const header = Buffer.alloc(4);
  header.writeUInt16BE(0xff00 | marker, 0);
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([header, payload]);
};

/**
 * A JPEG carrying EXIF (with GPS), XMP, an ICC profile, a Photoshop/IPTC block
 * and a comment. The frame is a valid 1x1 baseline SOF0 so dimensions parse.
 */
export function buildJpeg() {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    jpegSegment(0xe0, Buffer.concat([Buffer.from('JFIF\0', 'latin1'), Buffer.from([1, 1, 0, 0, 1, 0, 1, 0, 0])])),
    jpegSegment(0xe1, Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), buildExifBlock()])),
    jpegSegment(0xe1, Buffer.concat([
      Buffer.from('http://ns.adobe.com/xap/1.0/\0', 'latin1'),
      Buffer.from('<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF/></x:xmpmeta>', 'latin1'),
    ])),
    jpegSegment(0xe2, Buffer.concat([Buffer.from('ICC_PROFILE\0', 'latin1'), Buffer.alloc(120, 7)])),
    jpegSegment(0xed, Buffer.concat([Buffer.from('Photoshop 3.0\0', 'latin1'), Buffer.alloc(40, 3)])),
    jpegSegment(0xfe, Buffer.from('a private comment', 'latin1')),
    jpegSegment(0xdb, Buffer.concat([Buffer.from([0x00]), Buffer.alloc(64, 16)])),
    jpegSegment(0xc0, Buffer.from([0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00])),
    jpegSegment(0xc4, Buffer.concat([Buffer.from([0x00]), Buffer.alloc(16, 0)])),
    jpegSegment(0xda, Buffer.from([0x01, 0x01, 0x00, 0x00, 0x3f, 0x00])),
    Buffer.from([0x12, 0x34, 0xff, 0xd9]),
  ]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

const crc32 = (bytes) => {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
};

const pngChunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

/** A 64x48 PNG with two tEXt chunks, a tIME chunk and a pHYs chunk to keep. */
export function buildPng() {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(64, 0);
  header.writeUInt32BE(48, 4);
  header[8] = 8; // bit depth

  const modified = Buffer.alloc(7);
  modified.writeUInt16BE(2026, 0);
  modified.set([8, 13, 10, 30, 0], 2);

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('tEXt', Buffer.from('Author\0Ada Lovelace', 'latin1')),
    pngChunk('tEXt', Buffer.from('Software\0webTools fixture', 'latin1')),
    pngChunk('tIME', modified),
    pngChunk('pHYs', Buffer.from([0, 0, 11, 19, 0, 0, 11, 19, 1])),
    pngChunk('IDAT', Buffer.from([0x78, 0x9c, 0x63, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01])),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A WebP with a VP8X header advertising EXIF and XMP, plus both chunks. */
export function buildWebp() {
  const riffChunk = (type, data) => {
    const header = Buffer.alloc(8);
    header.write(type, 0, 'latin1');
    header.writeUInt32LE(data.length, 4);
    const padding = data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0);
    return Buffer.concat([header, data, padding]);
  };

  const extended = Buffer.alloc(10);
  extended[0] = 0x08 | 0x04; // EXIF and XMP flags
  extended.writeUIntLE(199, 4, 3);  // canvas width - 1
  extended.writeUIntLE(149, 7, 3);  // canvas height - 1

  const body = Buffer.concat([
    Buffer.from('WEBP', 'latin1'),
    riffChunk('VP8X', extended),
    riffChunk('VP8L', Buffer.alloc(20, 0x2f)),
    riffChunk('EXIF', buildExifBlock()),
    riffChunk('XMP ', Buffer.from('<x:xmpmeta/>', 'latin1')),
  ]);

  const header = Buffer.alloc(8);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

/** Node Buffers are views into a shared pool — hand callers their own bytes. */
export const toArrayBuffer = (buffer) => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
