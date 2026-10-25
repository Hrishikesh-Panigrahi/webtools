// Small text helpers shared by the parsers, the editor and error messages.

/** 1-based line and column of `offset` in `text`. */
export function locate(text, offset) {
  let line = 1;
  let lineStart = 0;
  for (let index = text.indexOf('\n'); index !== -1 && index < offset; index = text.indexOf('\n', index + 1)) {
    line++;
    lineStart = index + 1;
  }
  return { line, column: offset - lineStart + 1 };
}

/** How many lines `text` has; an empty string is one empty line. */
export function countLines(text) {
  let lines = 1;
  for (let index = text.indexOf('\n'); index !== -1; index = text.indexOf('\n', index + 1)) lines++;
  return lines;
}

/** `text` on one line and cut to `max` characters, so a message never echoes a whole input back. */
export function elide(text, max = 32) {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? flat.slice(0, max - 1) + '…' : flat;
}

/** An Error that knows where in `text` it happened, so an editor can mark the line. */
export function positionedError(message, text, offset, hint) {
  return Object.assign(new Error(message), { offset, ...locate(text, offset), hint });
}
