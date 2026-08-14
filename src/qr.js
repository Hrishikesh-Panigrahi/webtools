// QR Code encoding (ISO/IEC 18004): text in, a matrix of dark/light modules out.
//
// Supports numeric, alphanumeric and byte modes, versions 1-40 and all four
// error-correction levels. The narrowest mode that covers the text and the
// smallest version that fits are chosen automatically, so short numeric payloads
// produce far denser codes than a byte-mode-only encoder would.

const MODE_NUMERIC = { indicator: 1, countBits: [10, 12, 14] };
const MODE_ALPHANUMERIC = { indicator: 2, countBits: [9, 11, 13] };
const MODE_BYTE = { indicator: 4, countBits: [8, 16, 16] };

const ALPHANUMERIC_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

// Format-info bits for each level, ordered by increasing recovery capacity.
export const EC_LEVELS = { L: 0b01, M: 0b00, Q: 0b11, H: 0b10 };

// Indexed [level][version]; version 0 is unused padding.
const EC_CODEWORDS_PER_BLOCK = {
  L: [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  Q: [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  H: [0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
};

const EC_BLOCKS = {
  L: [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  Q: [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  H: [0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
};

// ---------- Galois field GF(256) for Reed-Solomon ----------

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

for (let i = 0, value = 1; i < 255; i++) {
  GF_EXP[i] = value;
  GF_LOG[value] = i;
  value <<= 1;
  if (value & 0x100) value ^= 0x11d; // the QR field's primitive polynomial
}
for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];

const gfMultiply = (a, b) => (a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]]);

/** Coefficients of (x - 2^0)(x - 2^1)…(x - 2^(degree-1)), highest power first. */
function generatorPolynomial(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    poly.forEach((coefficient, index) => {
      next[index] ^= coefficient;
      next[index + 1] ^= gfMultiply(coefficient, GF_EXP[i]);
    });
    poly = next;
  }
  return poly;
}

/** The `degree` error-correction codewords for one block of data codewords. */
function errorCorrection(data, degree) {
  const generator = generatorPolynomial(degree);
  const remainder = new Uint8Array(degree);
  for (const byte of data) {
    const factor = byte ^ remainder[0];
    remainder.copyWithin(0, 1);
    remainder[degree - 1] = 0;
    generator.slice(1).forEach((coefficient, index) => {
      remainder[index] ^= gfMultiply(coefficient, factor);
    });
  }
  return remainder;
}

// ---------- Bit stream ----------

class BitBuffer {
  constructor() { this.bits = []; }
  push(value, length) {
    for (let i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  }
  get length() { return this.bits.length; }
}

// ---------- Mode selection and payload encoding ----------

const isNumeric = (text) => /^[0-9]*$/.test(text);
const isAlphanumeric = (text) => [...text].every((char) => ALPHANUMERIC_CHARS.includes(char));

function chooseMode(text) {
  if (isNumeric(text)) return MODE_NUMERIC;
  if (isAlphanumeric(text)) return MODE_ALPHANUMERIC;
  return MODE_BYTE;
}

const countBitsFor = (mode, version) => mode.countBits[version <= 9 ? 0 : version <= 26 ? 1 : 2];

function encodeNumeric(text, buffer) {
  for (let i = 0; i < text.length; i += 3) {
    const group = text.slice(i, i + 3);
    buffer.push(Number(group), group.length * 3 + 1);
  }
}

function encodeAlphanumeric(text, buffer) {
  for (let i = 0; i < text.length; i += 2) {
    const first = ALPHANUMERIC_CHARS.indexOf(text[i]);
    if (i + 1 === text.length) { buffer.push(first, 6); break; }
    buffer.push(first * 45 + ALPHANUMERIC_CHARS.indexOf(text[i + 1]), 11);
  }
}

const encodeBytes = (bytes, buffer) => bytes.forEach((byte) => buffer.push(byte, 8));

/** How many characters the length field counts — bytes, not code points, in byte mode. */
function payloadLength(mode, text, bytes) {
  return mode === MODE_BYTE ? bytes.length : text.length;
}

function payloadBits(mode, text, bytes) {
  if (mode === MODE_BYTE) return bytes.length * 8;
  if (mode === MODE_NUMERIC) {
    const remainder = text.length % 3;
    return Math.floor(text.length / 3) * 10 + (remainder === 0 ? 0 : remainder * 3 + 1);
  }
  return Math.floor(text.length / 2) * 11 + (text.length % 2) * 6;
}

// ---------- Version capacity ----------

/** Data modules available for codewords, i.e. everything but the function patterns. */
function rawDataModules(version) {
  let modules = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const alignmentCount = Math.floor(version / 7) + 2;
    modules -= (25 * alignmentCount - 10) * alignmentCount - 55;
    if (version >= 7) modules -= 36;
  }
  return modules;
}

const totalCodewords = (version) => Math.floor(rawDataModules(version) / 8);

function dataCodewordCount(version, level) {
  return totalCodewords(version) - EC_CODEWORDS_PER_BLOCK[level][version] * EC_BLOCKS[level][version];
}

// ---------- Codeword assembly ----------

function buildDataCodewords(text, bytes, mode, version, level) {
  const capacityBits = dataCodewordCount(version, level) * 8;
  const buffer = new BitBuffer();
  buffer.push(mode.indicator, 4);
  buffer.push(payloadLength(mode, text, bytes), countBitsFor(mode, version));
  if (mode === MODE_NUMERIC) encodeNumeric(text, buffer);
  else if (mode === MODE_ALPHANUMERIC) encodeAlphanumeric(text, buffer);
  else encodeBytes(bytes, buffer);

  buffer.push(0, Math.min(4, capacityBits - buffer.length));
  buffer.push(0, (8 - (buffer.length % 8)) % 8);

  const codewords = [];
  for (let i = 0; i < buffer.length; i += 8) {
    codewords.push(buffer.bits.slice(i, i + 8).reduce((acc, bit) => (acc << 1) | bit, 0));
  }
  const PAD_BYTES = [0xec, 0x11];
  while (codewords.length < capacityBits / 8) codewords.push(PAD_BYTES[codewords.length % 2]);
  return codewords;
}

/**
 * Split the data into the version's blocks, append each block's error
 * correction, then interleave both halves the way the spec lays them out.
 */
function interleaveBlocks(dataCodewords, version, level) {
  const blockCount = EC_BLOCKS[level][version];
  const ecPerBlock = EC_CODEWORDS_PER_BLOCK[level][version];
  const shortBlockSize = Math.floor(dataCodewords.length / blockCount);
  const shortBlockCount = blockCount - (dataCodewords.length % blockCount);

  const blocks = [];
  let offset = 0;
  for (let i = 0; i < blockCount; i++) {
    const size = shortBlockSize + (i < shortBlockCount ? 0 : 1);
    const data = dataCodewords.slice(offset, offset + size);
    offset += size;
    blocks.push({ data, ec: errorCorrection(data, ecPerBlock) });
  }

  const result = [];
  for (let i = 0; i <= shortBlockSize; i++) {
    for (const block of blocks) if (i < block.data.length) result.push(block.data[i]);
  }
  for (let i = 0; i < ecPerBlock; i++) {
    for (const block of blocks) result.push(block.ec[i]);
  }
  return result;
}

// ---------- Matrix construction ----------

/** Center coordinates of the alignment patterns for a version. */
function alignmentCenters(version) {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const centers = [6];
  for (let position = version * 4 + 10; centers.length < count; position -= step) centers.splice(1, 0, position);
  return centers;
}

/** A matrix of `null` (free) cells plus a parallel map of reserved function modules. */
function createGrid(size) {
  return {
    size,
    modules: Array.from({ length: size }, () => new Array(size).fill(false)),
    reserved: Array.from({ length: size }, () => new Array(size).fill(false)),
    set(row, column, isDark) {
      this.modules[row][column] = isDark;
      this.reserved[row][column] = true;
    },
  };
}

function drawFinder(grid, row, column) {
  for (let dr = -1; dr <= 7; dr++) {
    for (let dc = -1; dc <= 7; dc++) {
      const r = row + dr;
      const c = column + dc;
      if (r < 0 || r >= grid.size || c < 0 || c >= grid.size) continue;
      const ring = Math.max(Math.abs(dr - 3), Math.abs(dc - 3));
      grid.set(r, c, ring !== 2 && ring <= 3);
    }
  }
}

function drawAlignment(grid, row, column) {
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      grid.set(row + dr, column + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
    }
  }
}

/** BCH(15,5) format information, masked as the spec requires. */
function formatBits(level, mask) {
  const data = (EC_LEVELS[level] << 3) | mask;
  let remainder = data;
  for (let i = 0; i < 10; i++) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  return ((data << 10) | remainder) ^ 0x5412;
}

/** BCH(18,6) version information, used from version 7 upwards. */
function versionBits(version) {
  let remainder = version;
  for (let i = 0; i < 12; i++) remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
  return (version << 12) | remainder;
}

function drawFunctionPatterns(grid, version) {
  const last = grid.size - 1;
  drawFinder(grid, 0, 0);
  drawFinder(grid, 0, last - 6);
  drawFinder(grid, last - 6, 0);

  for (let i = 8; i < grid.size - 8; i++) {
    const isDark = i % 2 === 0;
    grid.set(6, i, isDark);
    grid.set(i, 6, isDark);
  }

  const centers = alignmentCenters(version);
  for (const row of centers) {
    for (const column of centers) {
      const isFinderCorner = (row === 6 && column === 6)
        || (row === 6 && column === last - 6)
        || (row === last - 6 && column === 6);
      if (!isFinderCorner) drawAlignment(grid, row, column);
    }
  }

  grid.set(last - 7, 8, true); // the always-dark module
  if (version >= 7) {
    const bits = versionBits(version);
    for (let i = 0; i < 18; i++) {
      const isDark = ((bits >>> i) & 1) === 1;
      grid.set(Math.floor(i / 3), last - 10 + (i % 3), isDark);
      grid.set(last - 10 + (i % 3), Math.floor(i / 3), isDark);
    }
  }
}

/**
 * Where each of the 15 format bits lives, as `[bitIndex] -> [copyOne, copyTwo]`
 * in [row, column] form. Copy one wraps the top-left finder; copy two is split
 * between the bottom-left and top-right corners.
 */
function formatCells(size) {
  const cells = [];
  for (let i = 0; i <= 5; i++) cells.push([[i, 8], [8, size - 1 - i]]);
  cells.push([[7, 8], [8, size - 7]]);
  cells.push([[8, 8], [8, size - 8]]);
  cells.push([[8, 7], [size - 7, 8]]);
  for (let i = 9; i <= 14; i++) cells.push([[8, 14 - i], [size - 15 + i, 8]]);
  return cells;
}

function drawFormat(grid, level, mask) {
  const bits = formatBits(level, mask);
  formatCells(grid.size).forEach(([first, second], index) => {
    const isDark = ((bits >>> index) & 1) === 1;
    grid.set(first[0], first[1], isDark);
    grid.set(second[0], second[1], isDark);
  });
}

function reserveFormat(grid) {
  formatCells(grid.size).forEach(([first, second]) => {
    grid.reserved[first[0]][first[1]] = true;
    grid.reserved[second[0]][second[1]] = true;
  });
}

/** Walk the free modules bottom-right to top-left, two columns at a time. */
function placeCodewords(grid, codewords) {
  let bitIndex = 0;
  const nextBit = () => {
    const byte = codewords[bitIndex >>> 3];
    const bit = byte === undefined ? 0 : (byte >>> (7 - (bitIndex & 7))) & 1;
    bitIndex++;
    return bit === 1;
  };

  for (let right = grid.size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // the vertical timing pattern occupies column 6
    for (let step = 0; step < grid.size; step++) {
      const upward = ((grid.size - 1 - right) & 2) === 0;
      const row = upward ? grid.size - 1 - step : step;
      for (const column of [right, right - 1]) {
        if (!grid.reserved[row][column]) grid.modules[row][column] = nextBit();
      }
    }
  }
}

const MASK_RULES = [
  (row, column) => (row + column) % 2 === 0,
  (row) => row % 2 === 0,
  (row, column) => column % 3 === 0,
  (row, column) => (row + column) % 3 === 0,
  (row, column) => (Math.floor(row / 2) + Math.floor(column / 3)) % 2 === 0,
  (row, column) => ((row * column) % 2) + ((row * column) % 3) === 0,
  (row, column) => (((row * column) % 2) + ((row * column) % 3)) % 2 === 0,
  (row, column) => (((row + column) % 2) + ((row * column) % 3)) % 2 === 0,
];

function applyMask(grid, mask) {
  const rule = MASK_RULES[mask];
  for (let row = 0; row < grid.size; row++) {
    for (let column = 0; column < grid.size; column++) {
      if (!grid.reserved[row][column] && rule(row, column)) {
        grid.modules[row][column] = !grid.modules[row][column];
      }
    }
  }
}

const FINDER_RUN = [1, 1, 3, 1, 1];

function runPenalty(line) {
  let penalty = 0;
  let runLength = 1;
  for (let i = 1; i <= line.length; i++) {
    if (i < line.length && line[i] === line[i - 1]) { runLength++; continue; }
    if (runLength >= 5) penalty += 3 + (runLength - 5);
    runLength = 1;
  }
  return penalty;
}

/** Rule 3: a 1:1:3:1:1 finder-like run flanked by four light modules. */
function finderPenalty(line) {
  let penalty = 0;
  for (let i = 0; i + 10 < line.length; i++) {
    const window = line.slice(i, i + 11);
    const matches = (pattern) => pattern.every((value, index) => window[index] === value);
    const dark = [true, false, true, true, true, false, true];
    const light = [false, false, false, false];
    if (matches([...dark, ...light]) || matches([...light, ...dark])) penalty += 40;
  }
  return penalty;
}

function maskPenalty(grid) {
  const { size, modules } = grid;
  const columns = Array.from({ length: size }, (_, column) => modules.map((row) => row[column]));

  let penalty = 0;
  for (const line of [...modules, ...columns]) penalty += runPenalty(line) + finderPenalty(line);

  for (let row = 0; row < size - 1; row++) {
    for (let column = 0; column < size - 1; column++) {
      const first = modules[row][column];
      if (first === modules[row][column + 1] && first === modules[row + 1][column] && first === modules[row + 1][column + 1]) {
        penalty += 3;
      }
    }
  }

  const dark = modules.flat().filter(Boolean).length;
  const deviation = Math.abs(dark * 20 - size * size * 10) / (size * size);
  return penalty + Math.floor(deviation) * 10;
}

// ---------- Public API ----------

/** The smallest version that holds `text` at this level, or null if none does. */
function smallestVersion(mode, text, bytes, level, minVersion) {
  for (let version = Math.max(1, minVersion); version <= 40; version++) {
    const available = dataCodewordCount(version, level) * 8;
    const needed = 4 + countBitsFor(mode, version) + payloadBits(mode, text, bytes);
    if (needed <= available) return version;
  }
  return null;
}

/**
 * Encode text as a QR symbol.
 *
 * @param {string} text
 * @param {Object} [options]
 * @param {'L'|'M'|'Q'|'H'} [options.level]       error-correction level
 * @param {number} [options.minVersion]           force at least this version (1-40)
 * @returns {{ size:number, version:number, level:string, mode:string, modules:boolean[][] }}
 */
export function encodeQr(text, { level = 'M', minVersion = 1 } = {}) {
  if (!text) throw new Error('Nothing to encode.');
  if (EC_LEVELS[level] === undefined) throw new Error(`Unknown error-correction level "${level}".`);

  const bytes = new TextEncoder().encode(text);
  const mode = chooseMode(text);
  const version = smallestVersion(mode, text, bytes, level, minVersion);
  if (!version) throw new Error('Too much data for a QR code at this error-correction level.');

  const codewords = interleaveBlocks(buildDataCodewords(text, bytes, mode, version, level), version, level);

  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const grid = createGrid(version * 4 + 17);
    drawFunctionPatterns(grid, version);
    reserveFormat(grid);
    placeCodewords(grid, codewords);
    applyMask(grid, mask);
    drawFormat(grid, level, mask);
    const penalty = maskPenalty(grid);
    if (!best || penalty < best.penalty) best = { grid, penalty };
  }

  const modeName = mode === MODE_NUMERIC ? 'numeric' : mode === MODE_ALPHANUMERIC ? 'alphanumeric' : 'byte';
  return { size: best.grid.size, version, level, mode: modeName, modules: best.grid.modules };
}

// ---------- Rendering ----------

/** Render a matrix as a standalone SVG string with the standard 4-module margin. */
export function qrToSvg(matrix, { scale = 8, margin = 4, dark = '#000000', light = '#ffffff' } = {}) {
  const span = matrix.size + margin * 2;
  const path = [];
  matrix.modules.forEach((row, rowIndex) => {
    row.forEach((isDark, columnIndex) => {
      if (isDark) path.push(`M${columnIndex + margin} ${rowIndex + margin}h1v1h-1z`);
    });
  });
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${span * scale}" height="${span * scale}" viewBox="0 0 ${span} ${span}" shape-rendering="crispEdges">`,
    `<rect width="${span}" height="${span}" fill="${light}"/>`,
    `<path fill="${dark}" d="${path.join('')}"/>`,
    '</svg>',
  ].join('');
}

/** Draw a matrix onto a canvas at `scale` device pixels per module. */
export function qrToCanvas(matrix, canvas, { scale = 8, margin = 4, dark = '#000000', light = '#ffffff' } = {}) {
  const span = matrix.size + margin * 2;
  canvas.width = span * scale;
  canvas.height = span * scale;
  const context = canvas.getContext('2d');
  context.fillStyle = light;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = dark;
  matrix.modules.forEach((row, rowIndex) => {
    row.forEach((isDark, columnIndex) => {
      if (isDark) context.fillRect((columnIndex + margin) * scale, (rowIndex + margin) * scale, scale, scale);
    });
  });
  return canvas;
}
