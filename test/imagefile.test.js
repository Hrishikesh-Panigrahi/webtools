import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectImage, stripImageMetadata, detectFormat } from '../src/imagefile.js';
import { buildJpeg, buildPng, buildWebp, toArrayBuffer } from './helpers/image-fixtures.js';

/** Flatten a report's groups into a `{ tagName: value }` lookup. */
const tagsOf = (report) => Object.fromEntries(
  report.groups.flatMap((group) => group.tags.map((tag) => [tag.name, tag.value])),
);

const inspect = (buffer) => inspectImage(toArrayBuffer(buffer));

test('formats are detected from their magic bytes', () => {
  assert.equal(detectFormat(new Uint8Array(buildJpeg())), 'jpeg');
  assert.equal(detectFormat(new Uint8Array(buildPng())), 'png');
  assert.equal(detectFormat(new Uint8Array(buildWebp())), 'webp');
  assert.equal(detectFormat(new Uint8Array([0x47, 0x49, 0x46, 0x38])), 'gif');
  assert.equal(detectFormat(new Uint8Array([1, 2, 3, 4])), null);
});

test('an unsupported container reports why', () => {
  assert.throws(() => inspectImage(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]).buffer), /GIF/);
  assert.throws(() => inspectImage(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer), /Unrecognised/);
});

test('JPEG EXIF tags are decoded into readable values', () => {
  const report = inspect(buildJpeg());
  const tags = tagsOf(report);

  assert.equal(report.format, 'jpeg');
  assert.deepEqual([report.width, report.height], [1, 1]);
  assert.equal(tags.Make, 'Canon');
  assert.equal(tags.Model, 'Canon EOS R6');
  assert.equal(tags.Orientation, 'Rotated 90° CW');
  assert.equal(tags['Exposure Time'], '1/250 s', 'rationals become shutter speeds');
  assert.equal(tags['F Number'], 'f/2.8');
  assert.equal(tags.ISO, '400');
  assert.equal(tags['Focal Length'], '85 mm');
  assert.equal(tags.Flash, 'Fired, forced on', 'the firing mode lives in bits 3-4');
  assert.equal(tags['Lens Model'], 'RF85mm F1.2 L USM');
  assert.equal(tags.Taken, '2026-08-13 10:30:00', 'EXIF colon dates are normalised');
});

test('EXIF groups are separated and XMP is noticed', () => {
  const names = inspect(buildJpeg()).groups.map((group) => group.name);
  assert.deepEqual(names, ['Image', 'Camera & exposure', 'Location', 'XMP']);
});

test('GPS coordinates resolve to a signed decimal', () => {
  const { location } = inspect(buildJpeg());
  assert.ok(location, 'the fixture carries GPS');
  assert.ok(Math.abs(location.latitude - 48.858331) < 1e-5);
  assert.ok(Math.abs(location.longitude - 2.294467) < 1e-5);
  assert.equal(location.decimal, '48.858331, 2.294467');
  assert.equal(location.dms, '48° 51′ 29.99″ N, 2° 17′ 40.08″ E');
  assert.equal(location.altitude, 35);
});

test('a southern/western reference flips the sign', () => {
  // Rebuild the fixture with S/W references by patching the two ref tags.
  const jpeg = buildJpeg();
  const north = jpeg.indexOf(Buffer.from([0x00, 0x01, 0x00, 0x02, 0x00, 0x00, 0x00, 0x02, 0x4e]));
  const east = jpeg.indexOf(Buffer.from([0x00, 0x03, 0x00, 0x02, 0x00, 0x00, 0x00, 0x02, 0x45]));
  assert.ok(north > 0 && east > 0, 'the reference tags must be findable');
  jpeg[north + 8] = 0x53; // 'S'
  jpeg[east + 8] = 0x57;  // 'W'

  const { location } = inspect(jpeg);
  assert.ok(location.latitude < 0, 'south is negative');
  assert.ok(location.longitude < 0, 'west is negative');
});

test('PNG text and time chunks are read', () => {
  const report = inspect(buildPng());
  const tags = tagsOf(report);
  assert.equal(report.format, 'png');
  assert.deepEqual([report.width, report.height], [64, 48]);
  assert.equal(tags.Author, 'Ada Lovelace');
  assert.equal(tags.Software, 'webTools fixture');
  assert.equal(tags.Modified, '2026-08-13 10:30:00 UTC');
});

test('WebP dimensions and metadata chunks are read', () => {
  const report = inspect(buildWebp());
  assert.equal(report.format, 'webp');
  assert.deepEqual([report.width, report.height], [200, 150]);
  assert.ok(report.location, 'the EXIF chunk carries GPS');
  assert.ok(report.groups.some((group) => group.name === 'XMP'));
});

test('metadata blocks are flagged, rendering blocks are not', () => {
  const blocks = inspect(buildJpeg()).blocks;
  const named = Object.fromEntries(blocks.map((block) => [block.name, block.isMetadata]));
  assert.equal(named['EXIF / XMP'], true);
  assert.equal(named['Photoshop / IPTC'], true);
  assert.equal(named.Comment, true);
  assert.equal(named['ICC colour profile'], false, 'the colour profile affects rendering');
  assert.equal(named['JFIF header'], false);
  assert.equal(named['Baseline frame'], false);
});

test('stripping a JPEG removes every metadata block and keeps the rest', () => {
  const jpeg = buildJpeg();
  const { bytes, removed, format } = stripImageMetadata(toArrayBuffer(jpeg));

  assert.equal(format, 'jpeg');
  assert.ok(bytes.length < jpeg.length);
  const removedNames = removed.map((block) => block.name);
  assert.ok(removedNames.includes('EXIF / XMP'));
  assert.ok(removedNames.includes('Photoshop / IPTC'));
  assert.ok(removedNames.includes('Comment'));

  const after = inspect(Buffer.from(bytes));
  assert.deepEqual(after.groups, [], 'no metadata survives');
  assert.equal(after.location, null, 'GPS is gone');
  assert.deepEqual([after.width, after.height], [1, 1], 'the frame still parses');
  assert.ok(after.blocks.some((block) => block.name === 'ICC colour profile'), 'the profile is kept');
});

test('stripping a PNG keeps the critical chunks', () => {
  const png = buildPng();
  const { bytes, removed } = stripImageMetadata(toArrayBuffer(png));

  assert.equal(removed.length, 3, 'two tEXt chunks and one tIME chunk');
  const after = inspect(Buffer.from(bytes));
  assert.deepEqual(after.groups, []);
  assert.deepEqual([after.width, after.height], [64, 48]);
  const kept = after.blocks.map((block) => block.name);
  assert.ok(kept.includes('IHDR chunk') && kept.includes('IDAT chunk') && kept.includes('IEND chunk'));
  assert.ok(kept.includes('Pixel dimensions'), 'pHYs is not privacy data');
});

test('stripping a WebP rewrites the RIFF size and clears the VP8X flags', () => {
  const webp = buildWebp();
  const { bytes } = stripImageMetadata(toArrayBuffer(webp));

  const declared = new DataView(bytes.buffer, bytes.byteOffset).getUint32(4, true);
  assert.equal(declared, bytes.length - 8, 'the RIFF header must match the new length');

  const after = inspect(Buffer.from(bytes));
  assert.deepEqual(after.groups, []);
  assert.equal(after.location, null);
  assert.deepEqual([after.width, after.height], [200, 150], 'the canvas size survives');

  const extended = after.blocks.find((block) => block.name === 'Extended header');
  assert.ok(extended, 'VP8X is kept');
  const flags = bytes[bytes.indexOf(0x56, 12) + 8]; // first byte of the VP8X payload
  assert.equal(flags & 0x08, 0, 'the EXIF flag is cleared');
  assert.equal(flags & 0x04, 0, 'the XMP flag is cleared');
});

test('stripping is idempotent', () => {
  const once = stripImageMetadata(toArrayBuffer(buildJpeg()));
  const twice = stripImageMetadata(toArrayBuffer(Buffer.from(once.bytes)));
  assert.deepEqual(twice.removed, [], 'nothing left to remove');
  assert.deepEqual([...twice.bytes], [...once.bytes], 'the bytes do not change again');
});

test('image data is copied through byte for byte', () => {
  const jpeg = buildJpeg();
  const { bytes } = stripImageMetadata(toArrayBuffer(jpeg));
  // Everything from the quantisation tables onward is pixel data and must survive intact.
  const tail = jpeg.subarray(jpeg.indexOf(Buffer.from([0xff, 0xdb])));
  const strippedTail = Buffer.from(bytes).subarray(Buffer.from(bytes).indexOf(Buffer.from([0xff, 0xdb])));
  assert.deepEqual([...strippedTail], [...tail], 'no re-encoding');
});

test('an unsupported format cannot be stripped', () => {
  assert.throws(
    () => stripImageMetadata(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]).buffer),
    /Only JPEG, PNG and WebP/,
  );
});
