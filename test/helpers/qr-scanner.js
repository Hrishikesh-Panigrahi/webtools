// A minimal QR reader, used to prove the encoder round-trips.
//
// It deliberately re-derives everything from the finished matrix the way a real
// scanner would — read the format info, rebuild the function-pattern map from
// the version, undo the mask, walk the zigzag, de-interleave the blocks — and
// keeps its *own* copy of the block tables. A typo in the encoder's tables then
// shows up as a failed decode rather than a matching mistake on both sides.

const ALPHANUMERIC_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

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

const LEVEL_FROM_BITS = { 0b01: 'L', 0b00: 'M', 0b11: 'Q', 0b10: 'H' };

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

// ---------- Galois field, for checking the Reed-Solomon parity ----------

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
for (let i = 0, value = 1; i < 255; i++) {
  GF_EXP[i] = value;
  GF_LOG[value] = i;
  value <<= 1;
  if (value & 0x100) value ^= 0x11d;
}
for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];

const gfMultiply = (a, b) => (a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]]);

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

/** Zero for any valid codeword, since data+EC is divisible by the generator. */
export function reedSolomonRemainder(codewords, degree) {
  const generator = generatorPolynomial(degree);
  const remainder = new Uint8Array(degree);
  for (const byte of codewords) {
    const factor = byte ^ remainder[0];
    remainder.copyWithin(0, 1);
    remainder[degree - 1] = 0;
    generator.slice(1).forEach((coefficient, index) => {
      remainder[index] ^= gfMultiply(coefficient, factor);
    });
  }
  return remainder;
}

// ---------- Geometry ----------

function alignmentCenters(version) {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const centers = [6];
  for (let position = version * 4 + 10; centers.length < count; position -= step) centers.splice(1, 0, position);
  return centers;
}

export function rawDataModules(version) {
  let modules = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const alignmentCount = Math.floor(version / 7) + 2;
    modules -= (25 * alignmentCount - 10) * alignmentCount - 55;
    if (version >= 7) modules -= 36;
  }
  return modules;
}

/** Every module a scanner knows is not data, derived from the version alone. */
function functionModules(version) {
  const size = version * 4 + 17;
  const reserved = Array.from({ length: size }, () => new Array(size).fill(false));
  const mark = (row, column) => {
    if (row >= 0 && row < size && column >= 0 && column < size) reserved[row][column] = true;
  };
  const finder = (row, column) => {
    for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) mark(row + dr, column + dc);
  };

  const last = size - 1;
  finder(0, 0);
  finder(0, last - 6);
  finder(last - 6, 0);
  for (let i = 0; i < size; i++) { mark(6, i); mark(i, 6); }

  const centers = alignmentCenters(version);
  for (const row of centers) {
    for (const column of centers) {
      const isFinderCorner = (row === 6 && column === 6)
        || (row === 6 && column === last - 6)
        || (row === last - 6 && column === 6);
      if (isFinderCorner) continue;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) mark(row + dr, column + dc);
    }
  }

  mark(last - 7, 8);                                        // always-dark module
  for (let i = 0; i <= 8; i++) { mark(i, 8); mark(8, i); }   // format copy one
  for (let i = 0; i <= 7; i++) mark(8, last - i);            // copy two, top-right
  for (let i = 0; i <= 6; i++) mark(last - i, 8);            // copy two, bottom-left
  if (version >= 7) {
    for (let i = 0; i < 18; i++) {
      mark(Math.floor(i / 3), last - 10 + (i % 3));
      mark(last - 10 + (i % 3), Math.floor(i / 3));
    }
  }
  return reserved;
}

// ---------- Reading ----------

/** Read the first format-info copy and verify its BCH(15,5) code. */
function readFormat(modules) {
  const cells = [];
  for (let i = 0; i <= 5; i++) cells.push([i, 8]);
  cells.push([7, 8], [8, 8], [8, 7]);
  for (let i = 9; i <= 14; i++) cells.push([8, 14 - i]);

  let bits = 0;
  cells.forEach(([row, column], index) => { if (modules[row][column]) bits |= 1 << index; });

  const data = (bits ^ 0x5412) >>> 10;
  let remainder = data;
  for (let i = 0; i < 10; i++) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  if (((((data << 10) | remainder) ^ 0x5412) >>> 0) !== bits) {
    throw new Error('format information failed its BCH check');
  }
  return { level: LEVEL_FROM_BITS[data >>> 3], mask: data & 7 };
}

function readCodewords(modules, reserved, size, total) {
  const bits = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < size; step++) {
      const upward = ((size - 1 - right) & 2) === 0;
      const row = upward ? size - 1 - step : step;
      for (const column of [right, right - 1]) {
        if (!reserved[row][column]) bits.push(modules[row][column] ? 1 : 0);
      }
    }
  }
  const codewords = [];
  for (let i = 0; i + 8 <= bits.length && codewords.length < total; i += 8) {
    codewords.push(bits.slice(i, i + 8).reduce((accumulator, bit) => (accumulator << 1) | bit, 0));
  }
  return codewords;
}

function deinterleave(stream, version, level) {
  const blockCount = EC_BLOCKS[level][version];
  const ecPerBlock = EC_CODEWORDS_PER_BLOCK[level][version];
  const dataTotal = stream.length - ecPerBlock * blockCount;
  const shortSize = Math.floor(dataTotal / blockCount);
  const shortCount = blockCount - (dataTotal % blockCount);
  const sizes = Array.from({ length: blockCount }, (_, i) => shortSize + (i < shortCount ? 0 : 1));

  const data = sizes.map(() => []);
  let cursor = 0;
  for (let i = 0; i <= shortSize; i++) {
    for (let block = 0; block < blockCount; block++) if (i < sizes[block]) data[block].push(stream[cursor++]);
  }
  const ec = sizes.map(() => []);
  for (let i = 0; i < ecPerBlock; i++) {
    for (let block = 0; block < blockCount; block++) ec[block].push(stream[cursor++]);
  }
  return { data, ec, ecPerBlock };
}

function parsePayload(dataCodewords, version) {
  const bits = dataCodewords.flatMap((byte) => [...Array(8)].map((_, i) => (byte >>> (7 - i)) & 1));
  let cursor = 0;
  const take = (count) => {
    let value = 0;
    for (let i = 0; i < count; i++) value = (value << 1) | bits[cursor++];
    return value;
  };

  const mode = take(4);
  const group = version <= 9 ? 0 : version <= 26 ? 1 : 2;

  if (mode === 1) {
    const count = take([10, 12, 14][group]);
    let text = '';
    while (text.length < count) {
      const digits = Math.min(3, count - text.length);
      text += String(take(digits * 3 + 1)).padStart(digits, '0');
    }
    return { mode: 'numeric', text };
  }
  if (mode === 2) {
    const count = take([9, 11, 13][group]);
    let text = '';
    while (text.length < count) {
      if (count - text.length === 1) { text += ALPHANUMERIC_CHARS[take(6)]; break; }
      const pair = take(11);
      text += ALPHANUMERIC_CHARS[Math.floor(pair / 45)] + ALPHANUMERIC_CHARS[pair % 45];
    }
    return { mode: 'alphanumeric', text };
  }
  if (mode === 4) {
    const count = take([8, 16, 16][group]);
    const bytes = Uint8Array.from({ length: count }, () => take(8));
    return { mode: 'byte', text: new TextDecoder().decode(bytes) };
  }
  throw new Error(`unexpected mode indicator ${mode}`);
}

/**
 * Decode a matrix produced by `encodeQr`.
 *
 * @param {{size:number, version:number, modules:boolean[][]}} matrix
 * @returns {{ text:string, mode:string, level:string, mask:number, parityOk:boolean }}
 */
export function scanQr(matrix) {
  const { size, version, modules } = matrix;
  const format = readFormat(modules);
  const reserved = functionModules(version);

  const unmasked = modules.map((row, rowIndex) => row.map((cell, columnIndex) => (
    !reserved[rowIndex][columnIndex] && MASK_RULES[format.mask](rowIndex, columnIndex) ? !cell : cell
  )));

  const total = Math.floor(rawDataModules(version) / 8);
  const stream = readCodewords(unmasked, reserved, size, total);
  const { data, ec, ecPerBlock } = deinterleave(stream, version, format.level);

  const parityOk = data.every((block, index) => (
    reedSolomonRemainder([...block, ...ec[index]], ecPerBlock).every((byte) => byte === 0)
  ));

  return { ...parsePayload(data.flat(), version), level: format.level, mask: format.mask, parityOk };
}

/** Data codewords available at a version and level — the encoder's capacity. */
export function dataCodewordCount(version, level) {
  return Math.floor(rawDataModules(version) / 8) - EC_CODEWORDS_PER_BLOCK[level][version] * EC_BLOCKS[level][version];
}
