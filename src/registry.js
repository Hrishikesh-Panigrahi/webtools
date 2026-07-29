// The single source of truth for every tool.
// To add a tool: create/extend a module in ./tools and import it here.
import json from './tools/json.js';
import encode from './tools/encode.js';
import url from './tools/url.js';
import text from './tools/text.js';
import markdown from './tools/markdown.js';
import ai from './tools/ai.js';
import code from './tools/code.js';
import hash from './tools/hash.js';
import cipher from './tools/cipher.js';
import color from './tools/color.js';
import convert from './tools/convert.js';

export const tools = [
  ...json, ...url, ...encode, ...text, ...markdown, ...ai, ...code, ...convert, ...color, ...hash, ...cipher,
];

// Preserve first-seen category order.
export const categories = tools.reduce((acc, t) => {
  (acc[t.category] ??= []).push(t);
  return acc;
}, {});
