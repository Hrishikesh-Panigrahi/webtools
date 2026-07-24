// Tool state (de)serialization, shared by the shell (persistence + share links)
// and by tools that pipe their output into another tool.
//
// State is a positional array of control values: strings for text/number/range
// inputs, booleans for checkboxes — in document order of a tool's editable
// controls. The shell reads and writes it; a pipe just builds the query string.

/** Build the `?s=…` query for a tool URL from a values array. */
export function encodeState(values) {
  return 's=' + encodeURIComponent(JSON.stringify(values));
}

/** Parse a values array from a hash query string (the part after `?`), or null. */
export function decodeState(query) {
  const match = /(?:^|&)s=([^&]*)/.exec(query || '');
  if (!match) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(match[1]));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
