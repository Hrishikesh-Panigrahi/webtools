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
import image from './tools/image.js';
import network from './tools/network.js';
import qr from './tools/qr.js';

export const tools = [
  ...json, ...url, ...encode, ...text, ...markdown, ...ai, ...code, ...convert,
  ...color, ...image, ...network, ...qr, ...hash, ...cipher,
];

// Preserve first-seen category order.
export const categories = tools.reduce((byCategory, tool) => {
  (byCategory[tool.category] ??= []).push(tool);
  return byCategory;
}, {});

// A Map rather than a plain object: ids arrive from the URL, and an object
// would happily return Object.prototype for "#__proto__" or a function for
// "#constructor".
const toolsById = new Map(tools.map((tool) => [tool.id, tool]));

/** The tool with this id, or undefined. */
export const findTool = (id) => toolsById.get(id);
