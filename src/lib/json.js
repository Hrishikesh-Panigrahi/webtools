// JSON parsing that says *where* it failed, plus the formatting and path
// helpers the JSON tools share.
//
// `JSON.parse` messages differ by browser and Safari's carry no position at all,
// so on failure the text is re-scanned by a small recursive-descent parser that
// reports a line, a column and, for the usual mistakes, what to do about it.
// The same parser in relaxed mode reads what people actually paste from
// JavaScript or Python — comments, trailing commas, single or curly quotes,
// bare keys, True/False/None — which is what a "Repair" button needs.

import { locate, elide } from './text.js';

export class JsonSyntaxError extends SyntaxError {
  /**
   * @param {string} message
   * @param {Object} [where]
   * @param {number} [where.offset]  index into the text, when known
   * @param {number} [where.line]    1-based
   * @param {number} [where.column]  1-based
   * @param {string} [where.hint]    what to do about it, in plain words
   */
  constructor(message, { offset, line, column, hint } = {}) {
    super(message);
    this.name = 'JsonSyntaxError';
    this.offset = offset;
    this.line = line;
    this.column = column;
    this.hint = hint;
  }
}

/**
 * Parse JSON, throwing a JsonSyntaxError with a position and hint on failure.
 * `relaxed` also accepts the JavaScript/Python-isms listed at the top.
 */
export function parseJson(text, { relaxed = false } = {}) {
  if (relaxed) return new Parser(text, true).parseDocument();
  try {
    return JSON.parse(text);
  } catch (nativeError) {
    try {
      new Parser(text, false).parseDocument();
    } catch (error) {
      if (error instanceof JsonSyntaxError) throw error;
    }
    // The scanner accepted what JSON.parse rejected (or ran out of stack on a
    // pathologically deep document): fall back to the browser's own words.
    throw new JsonSyntaxError(`Invalid JSON: ${nativeError.message}`);
  }
}

/** Whether `parseJson(text, { relaxed: true })` would succeed where strict parsing fails. */
export function isRepairable(text) {
  try {
    JSON.parse(text);
    return false;
  } catch {
    try {
      new Parser(text, true).parseDocument();
      return true;
    } catch {
      return false;
    }
  }
}

const CHARACTER_NAMES = {
  '﻿': 'an invisible byte-order mark',
  ' ': 'a non-breaking space',
  '​': 'a zero-width space',
  '\t': 'a tab',
};

function describeCharacter(char) {
  if (char === undefined) return 'the end of the input';
  return CHARACTER_NAMES[char] ?? `"${char}"`;
}

const isDigit = (char) => char >= '0' && char <= '9';
const isWordChar = (char) => char !== undefined && /[\w$]/.test(char);
const CURLY_OPEN = '“';
const CURLY_CLOSE = '”';
const isQuote = (char) => char === '"' || char === "'" || char === CURLY_OPEN || char === CURLY_CLOSE;
const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const ESCAPES = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
const PYTHON_LITERALS = { True: true, False: false, None: null };
const BRACKET_PAIRS = { '{': '}', '[': ']' };

// `obj[key] = value` with key "__proto__" would set the prototype rather than
// create a property, which is not what the text says (and not what JSON.parse does).
function setProperty(target, key, value) {
  if (key === '__proto__') {
    Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true });
  } else {
    target[key] = value;
  }
}

class Parser {
  constructor(text, relaxed) {
    this.text = text;
    this.relaxed = relaxed;
    this.pos = 0;
    this.openBrackets = [];
  }

  fail(message, hint, at = this.pos) {
    throw new JsonSyntaxError(message, { offset: at, ...locate(this.text, at), hint });
  }

  // Called at end of input inside a container, so the reader learns which
  // bracket is missing its partner rather than just "unexpected end".
  failUnclosed() {
    const opener = this.openBrackets.at(-1);
    const { line, column } = locate(this.text, opener);
    const char = this.text[opener];
    this.fail(
      `Unexpected end of input — "${BRACKET_PAIRS[char]}" is missing.`,
      `The "${char}" opened at line ${line}, column ${column} is never closed.`,
    );
  }

  parseDocument() {
    this.skipBlank();
    if (this.pos >= this.text.length) this.fail('The input is empty.');
    const value = this.parseValue();
    this.skipBlank();
    if (this.pos < this.text.length) {
      this.fail(
        `Unexpected ${describeCharacter(this.text[this.pos])} after the end of the JSON value.`,
        'Only one value is allowed. If these are separate documents, wrap them in [ ] and separate them with commas.',
      );
    }
    return value;
  }

  skipBlank() {
    const { text } = this;
    while (this.pos < text.length) {
      const char = text[this.pos];
      if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
        this.pos++;
      } else if (char === '/' && (text[this.pos + 1] === '/' || text[this.pos + 1] === '*')) {
        if (!this.relaxed) this.fail('Comments are not allowed in JSON.', 'Remove the comment, or use Repair to strip every comment.');
        this.skipComment();
      } else if (this.relaxed && CHARACTER_NAMES[char]) {
        this.pos++;
      } else {
        return;
      }
    }
  }

  skipComment() {
    const { text } = this;
    if (text[this.pos + 1] === '/') {
      const end = text.indexOf('\n', this.pos);
      this.pos = end === -1 ? text.length : end + 1;
      return;
    }
    const end = text.indexOf('*/', this.pos + 2);
    if (end === -1) this.fail('Unclosed /* comment.', 'Add */ where the comment ends.');
    this.pos = end + 2;
  }

  parseValue() {
    const char = this.text[this.pos];
    if (char === '{') return this.parseObject();
    if (char === '[') return this.parseArray();
    if (char === '"') return this.parseString();
    if (isQuote(char)) {
      if (!this.relaxed) this.failQuote(char, 'Strings');
      return this.parseString();
    }
    if (char === '-' || isDigit(char)) return this.parseNumber();
    if (char === undefined) {
      if (this.openBrackets.length) this.failUnclosed();
      this.fail('Unexpected end of input — a value is missing.');
    }
    if (char === '.') this.fail('Numbers need a digit before the decimal point.', 'Write 0.5 rather than .5.');
    if (char === '+') this.fail('Numbers cannot start with "+".', 'Drop the plus sign.');
    return this.parseWord();
  }

  failQuote(char, what) {
    const curly = char === CURLY_OPEN || char === CURLY_CLOSE;
    this.fail(
      curly ? `${what} cannot use curly quotes (“ ”).` : `${what} must use double quotes, not single quotes.`,
      curly
        ? 'These usually come from a word processor or chat app. Replace them with straight double quotes, or use Repair.'
        : 'Replace the single quotes with double quotes, or use Repair.',
    );
  }

  readWord() {
    const start = this.pos;
    while (isWordChar(this.text[this.pos])) this.pos++;
    return this.text.slice(start, this.pos);
  }

  parseWord() {
    const start = this.pos;
    const word = this.readWord();
    if (word === 'true') return true;
    if (word === 'false') return false;
    if (word === 'null') return null;
    if (word in PYTHON_LITERALS) {
      if (this.relaxed) return PYTHON_LITERALS[word];
      this.fail(`"${word}" is not valid JSON.`, 'JSON literals are lowercase: true, false and null. Repair converts these.', start);
    }
    if (word === 'undefined' || word === 'NaN' || word === 'Infinity') {
      this.fail(`${word} is not a JSON value.`, 'Use null, or quote it as a string.', start);
    }
    if (word) this.fail(`Unexpected word "${elide(word)}".`, 'Text values must be wrapped in double quotes.', start);
    const char = this.text[start];
    this.fail(
      `Expected a value but found ${describeCharacter(char)}.`,
      CHARACTER_NAMES[char] ? 'It is invisible in most editors. Delete it, or use Repair.' : undefined,
      start,
    );
  }

  parseNumber() {
    const start = this.pos;
    NUMBER.lastIndex = start;
    const match = NUMBER.exec(this.text);
    if (!match) this.fail('A minus sign must be followed by digits.', undefined, start);
    this.pos = NUMBER.lastIndex;
    const next = this.text[this.pos];
    if (match[0] === '0' && (next === 'x' || next === 'X')) {
      this.fail('Hexadecimal numbers are not allowed in JSON.', 'Write the number in decimal, or quote it as a string.', start);
    }
    if (isDigit(next)) this.fail('Numbers cannot have leading zeros.', 'Drop the leading zero, or quote the value if it is an ID.', start);
    if (next === '.' && !match[0].includes('.')) this.fail('A decimal point must be followed by digits.', 'Write 1.0 or 1 rather than 1.', this.pos);
    if (isWordChar(next) || next === '.') this.fail(`Invalid number "${elide(this.text.slice(start, this.pos + 1))}".`, undefined, start);
    return Number(match[0]);
  }

  parseString() {
    const { text } = this;
    const start = this.pos;
    const opener = text[start];
    const isClosing = opener === '"' ? (char) => char === '"'
      : opener === "'" ? (char) => char === "'"
      : (char) => char === CURLY_OPEN || char === CURLY_CLOSE;
    this.pos++;
    let result = '';
    let runStart = this.pos;
    for (;;) {
      const char = text[this.pos];
      if (char === undefined) {
        this.fail('Unterminated string.', 'This string has no closing quote.', start);
      }
      if (isClosing(char)) {
        result += text.slice(runStart, this.pos);
        this.pos++;
        return result;
      }
      if (char === '\\') {
        result += text.slice(runStart, this.pos) + this.parseEscape();
        runStart = this.pos;
        continue;
      }
      if (char === '\n' || char === '\r') {
        this.fail('Line break inside a string.', 'A string must end on the line it starts. Check for a missing closing quote, or write \\n for a line break.');
      }
      if (char === '\t' && !this.relaxed) this.fail('Unescaped tab inside a string.', 'Write \\t instead of a literal tab.');
      if (char < ' ' && char !== '\t') this.fail('Control character inside a string.', 'Escape it as \\u00XX.');
      this.pos++;
    }
  }

  parseEscape() {
    const { text } = this;
    const escapeAt = this.pos;
    const char = text[this.pos + 1];
    this.pos += 2;
    if (char in ESCAPES) return ESCAPES[char];
    if (char === "'" && this.relaxed) return "'";
    if (char === 'u') {
      const hex = text.slice(this.pos, this.pos + 4);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.fail('\\u must be followed by four hex digits.', undefined, escapeAt);
      this.pos += 4;
      return String.fromCharCode(Number.parseInt(hex, 16));
    }
    this.fail(
      `Invalid escape "\\${char ?? ''}" in a string.`,
      'A backslash starts an escape. For a literal backslash, as in a Windows path, write \\\\.',
      escapeAt,
    );
  }

  parseKey() {
    const char = this.text[this.pos];
    if (char === '"') return this.parseString();
    if (isQuote(char)) {
      if (!this.relaxed) this.failQuote(char, 'Property names');
      return this.parseString();
    }
    if (isWordChar(char)) {
      const start = this.pos;
      const word = this.readWord();
      if (!this.relaxed) {
        this.fail(`Unquoted key: ${elide(word)}`, `JSON keys must be in double quotes. Write "${elide(word)}", or use Repair to quote every bare key.`, start);
      }
      return word;
    }
    if (char === undefined) this.failUnclosed();
    this.fail(`Expected a property name but found ${describeCharacter(char)}.`);
  }

  // Shared by objects and arrays: after an entry comes a comma, the closer, or
  // a mistake worth naming precisely.
  readSeparator(closer, noun) {
    this.skipBlank();
    const next = this.text[this.pos];
    if (next === closer) {
      this.pos++;
      this.openBrackets.pop();
      return 'end';
    }
    if (next === ',') {
      const commaAt = this.pos;
      this.pos++;
      this.skipBlank();
      if (this.text[this.pos] === closer) {
        if (!this.relaxed) this.fail(`Trailing comma before "${closer}".`, `JSON does not allow a comma after the last ${noun}. Remove it, or use Repair.`, commaAt);
        this.pos++;
        this.openBrackets.pop();
        return 'end';
      }
      return 'next';
    }
    if (next === undefined) this.failUnclosed();
    if (next === '}' || next === ']') {
      const opener = this.openBrackets.at(-1);
      const { line, column } = locate(this.text, opener);
      this.fail(`Expected "," or "${closer}" but found "${next}".`, `The "${this.text[opener]}" opened at line ${line}, column ${column} is closed with "${next}".`);
    }
    if (isQuote(next) || isWordChar(next) || next === '{' || next === '[' || next === '-') {
      this.fail(`Missing comma before this ${noun}.`, `Separate each ${noun} from the next with a comma.`);
    }
    this.fail(`Expected "," or "${closer}" but found ${describeCharacter(next)}.`);
  }

  parseObject() {
    this.openBrackets.push(this.pos);
    this.pos++;
    const result = {};
    this.skipBlank();
    if (this.text[this.pos] === '}') {
      this.pos++;
      this.openBrackets.pop();
      return result;
    }
    for (;;) {
      this.skipBlank();
      const keyAt = this.pos;
      const key = this.parseKey();
      this.skipBlank();
      if (this.text[this.pos] !== ':') {
        if (this.text[this.pos] === undefined) this.failUnclosed();
        this.fail(`Expected ":" after the property name "${elide(key)}".`, undefined, this.pos > keyAt ? this.pos : keyAt);
      }
      this.pos++;
      this.skipBlank();
      setProperty(result, key, this.parseValue());
      if (this.readSeparator('}', 'property') === 'end') return result;
    }
  }

  parseArray() {
    this.openBrackets.push(this.pos);
    this.pos++;
    const result = [];
    this.skipBlank();
    if (this.text[this.pos] === ']') {
      this.pos++;
      this.openBrackets.pop();
      return result;
    }
    for (;;) {
      this.skipBlank();
      if (this.text[this.pos] === ',') this.fail('Empty item in array.', 'Two commas in a row leave a hole. Remove one, or put null there.');
      result.push(this.parseValue());
      if (this.readSeparator(']', 'item') === 'end') return result;
    }
  }
}

// ---------- Formatting ----------

// A short array of plain values reads better on one line, the way people write
// them by hand. The tree view follows the same rule, so its line numbers match
// the formatted text line for line.
const INLINE_ARRAY_LIMIT = 60;

const isBranch = (value) => value !== null && typeof value === 'object';

/** Whether `value` is an array that formats on a single line. */
export function isInlineArray(value) {
  if (!Array.isArray(value) || value.length === 0) return false;
  let length = 2;
  for (const item of value) {
    if (isBranch(item)) return false;
    length += JSON.stringify(item).length + 2;
    if (length > INLINE_ARRAY_LIMIT) return false;
  }
  return true;
}

/** Pretty-print `value` with `indent`, keeping short arrays of plain values inline. */
export function formatJson(value, indent = '  ') {
  const render = (node, pad) => {
    if (!isBranch(node)) return JSON.stringify(node);
    const isArray = Array.isArray(node);
    if (isArray ? node.length === 0 : Object.keys(node).length === 0) return isArray ? '[]' : '{}';
    if (isInlineArray(node)) return `[${node.map((item) => JSON.stringify(item)).join(', ')}]`;
    const inner = pad + indent;
    const lines = isArray
      ? node.map((item) => inner + render(item, inner))
      : Object.entries(node).map(([key, child]) => `${inner}${JSON.stringify(key)}: ${render(child, inner)}`);
    return `${isArray ? '[' : '{'}\n${lines.join(',\n')}\n${pad}${isArray ? ']' : '}'}`;
  };
  return render(value, '');
}

// The tree asks for every branch's count while numbering its children, which
// would re-walk each subtree once per ancestor without remembering the answers.
const lineCounts = new WeakMap();

/** How many lines `formatJson(value)` produces, without building the string. */
export function formattedLineCount(value) {
  if (!isBranch(value) || isInlineArray(value)) return 1;
  let count = lineCounts.get(value);
  if (count === undefined) {
    const children = Array.isArray(value) ? value : Object.values(value);
    count = children.length ? children.reduce((sum, child) => sum + formattedLineCount(child), 2) : 1;
    lineCounts.set(value, count);
  }
  return count;
}

/** `text` rewritten as valid, formatted JSON via relaxed parsing, or null if even that fails. */
export function repairJson(text, indent = '  ') {
  try {
    return formatJson(parseJson(text, { relaxed: true }), indent);
  } catch {
    return null;
  }
}

// ---------- Paths and stats ----------

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** The JSONPath of `key` under `parentPath`: `$.users[0]["first name"]`. */
export function childPath(parentPath, key) {
  if (typeof key === 'number') return `${parentPath}[${key}]`;
  return IDENTIFIER.test(key) ? `${parentPath}.${key}` : `${parentPath}[${JSON.stringify(key)}]`;
}

/** Counts for a parsed document: object keys, array items and nesting depth. */
export function measureJson(value) {
  let keys = 0;
  let items = 0;
  let depth = 0;
  const visit = (node, level) => {
    if (!isBranch(node)) return;
    depth = Math.max(depth, level);
    if (Array.isArray(node)) {
      items += node.length;
      node.forEach((child) => visit(child, level + 1));
    } else {
      const children = Object.values(node);
      keys += children.length;
      children.forEach((child) => visit(child, level + 1));
    }
  };
  visit(value, 1);
  return { keys, items, depth };
}
