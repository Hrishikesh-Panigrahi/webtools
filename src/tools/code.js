import { h, copyBtn } from '../dom.js';
import { transformTool, keyValueRow } from '../panel.js';
import { parseCron, describeCron, daysAreEitherOr, nextRuns, HORIZON_YEARS } from '../cron.js';

// --- cURL -> fetch ---

/**
 * Split a command line into arguments the way a shell would: single and double
 * quotes, backslash escapes, and `\`-continued lines all collapse away.
 */
function shellSplit(command) {
  const args = [];
  let current = '';
  let quote = '';
  let hasArg = false;

  for (let i = 0; i < command.length; i++) {
    const character = command[i];
    if (quote) {
      if (character === quote) { quote = ''; continue; }
      if (character === '\\' && quote === '"' && i + 1 < command.length) { current += command[++i]; continue; }
      current += character;
      continue;
    }
    if (character === '"' || character === "'") { quote = character; hasArg = true; continue; }
    if (character === '\\' && /[\r\n]/.test(command[i + 1] ?? '')) {
      i += command[i + 1] === '\r' && command[i + 2] === '\n' ? 2 : 1;
      continue;
    }
    if (character === '\\' && i + 1 < command.length) { current += command[++i]; hasArg = true; continue; }
    if (/\s/.test(character)) {
      if (hasArg) { args.push(current); current = ''; hasArg = false; }
      continue;
    }
    current += character;
    hasArg = true;
  }
  if (quote) throw new Error('Unclosed quote in the command.');
  if (hasArg) args.push(current);
  return args;
}

// Flags that change how curl behaves but have no counterpart in fetch.
const IGNORED_FLAGS = new Set([
  '--compressed', '-L', '--location', '-s', '--silent', '-S', '--show-error',
  '-i', '--include', '-k', '--insecure', '-v', '--verbose', '-g', '--globoff', '--fail', '-f',
]);
const DATA_FLAGS = new Set(['-d', '--data', '--data-raw', '--data-binary', '--data-ascii', '--data-urlencode']);

function parseCurl(command) {
  const args = shellSplit(command.trim());
  if (!args.length || args[0] !== 'curl') throw new Error('Paste a command that starts with `curl`.');

  let url = '';
  let method = '';
  const headers = new Map();
  const data = [];

  for (let i = 1; i < args.length; i++) {
    const flag = args[i];
    const valueOf = () => {
      if (i + 1 >= args.length) throw new Error(`${flag} is missing its value.`);
      return args[++i];
    };

    if (flag === '-X' || flag === '--request') method = valueOf().toUpperCase();
    else if (flag === '-H' || flag === '--header') addHeader(headers, valueOf());
    else if (flag === '-A' || flag === '--user-agent') headers.set('user-agent', valueOf());
    else if (flag === '-b' || flag === '--cookie') headers.set('cookie', valueOf());
    else if (flag === '-e' || flag === '--referer') headers.set('referer', valueOf());
    else if (flag === '-u' || flag === '--user') headers.set('authorization', `Basic ${btoa(valueOf())}`);
    else if (DATA_FLAGS.has(flag)) data.push(valueOf());
    else if (flag === '--url') url = valueOf();
    else if (IGNORED_FLAGS.has(flag)) continue;
    // An unrecognised flag is skipped along with its value, so options this tool
    // doesn't model (`--retry 3`, `-o out.json`) don't get mistaken for the URL.
    else if (flag.startsWith('-')) { if (args[i + 1] && !args[i + 1].startsWith('-')) i++; }
    else if (!url) url = flag;
  }

  if (!url) throw new Error('No URL found in the command.');
  const body = data.length ? data.join('&') : null;
  return { url, method: method || (body === null ? 'GET' : 'POST'), headers, body };
}

function addHeader(headers, raw) {
  const separator = raw.indexOf(':');
  if (separator < 0) return; // `-H "Accept;"` removes a header — nothing to add
  const name = raw.slice(0, separator).trim().toLowerCase();
  if (name) headers.set(name, raw.slice(separator + 1).trim());
}

const continueIndent = (text, spaces) => text
  .split('\n')
  .map((line, index) => (index === 0 ? line : ' '.repeat(spaces) + line))
  .join('\n');

const objectLiteral = (entries, indent) => entries.length
  ? `{\n${entries.map(([key, value]) => `${' '.repeat(indent + 2)}${JSON.stringify(key)}: ${JSON.stringify(value)},`).join('\n')}\n${' '.repeat(indent)}}`
  : '{}';

function formatBody(body, headers) {
  const type = headers.get('content-type') ?? '';
  if (type.includes('json')) {
    try {
      return `JSON.stringify(${continueIndent(JSON.stringify(JSON.parse(body), null, 2), 2)})`;
    } catch {
      // Not actually JSON despite the header — fall through to a plain string.
    }
  }
  if (type.includes('x-www-form-urlencoded')) {
    const entries = [...new URLSearchParams(body)];
    if (entries.length) return `new URLSearchParams(${objectLiteral(entries, 2)})`;
  }
  return JSON.stringify(body);
}

function curlToFetch(command) {
  const { url, method, headers, body } = parseCurl(command);
  const options = [`  method: ${JSON.stringify(method)},`];
  if (headers.size) options.push(`  headers: ${objectLiteral([...headers], 2)},`);
  if (body !== null) options.push(`  body: ${formatBody(body, headers)},`);

  return [
    `const response = await fetch(${JSON.stringify(url)}, {`,
    ...options,
    '});',
    '',
    'if (!response.ok) throw new Error(`Request failed with ${response.status}`);',
    'const data = await response.json();',
  ].join('\n');
}

// --- JSON -> TypeScript ---
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const pascalCase = (text) => text
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .split(/[^\p{L}\p{N}]+/u)
  .filter(Boolean)
  .map((word) => word[0].toUpperCase() + word.slice(1))
  .join('');

// Name an array's element type after the singular of the key holding it, so
// `users: [...]` yields a `User` interface.
function singular(name) {
  if (/ies$/i.test(name)) return `${name.slice(0, -3)}y`;
  if (/[^s]s$/i.test(name)) return name.slice(0, -1);
  return name;
}

const propertyName = (key) => (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key));

function scalarType(value) {
  if (value === null) return 'null';
  const kind = typeof value;
  return kind === 'string' || kind === 'number' || kind === 'boolean' ? kind : 'unknown';
}

// Interfaces are reserved on the way down and filled in on the way back up, so
// the root is declared first and nested types follow in the order they appear.
function createInterfaces() {
  const slots = [];
  const taken = new Set();
  return {
    reserve(hint) {
      const base = pascalCase(hint) || 'Item';
      const safe = /^\d/.test(base) ? `Type${base}` : base;
      let name = safe;
      for (let suffix = 2; taken.has(name); suffix++) name = safe + suffix;
      taken.add(name);
      const slot = { name, fields: [] };
      slots.push(slot);
      return slot;
    },
    render() {
      return slots
        .map(({ name, fields }) => (fields.length ? `interface ${name} {\n${fields.join('\n')}\n}` : `interface ${name} {}`))
        .join('\n\n');
    },
  };
}

function objectType(samples, name, interfaces) {
  const slot = interfaces.reserve(name);
  const keys = [...new Set(samples.flatMap(Object.keys))];
  slot.fields = keys.map((key) => {
    const present = samples.filter((sample) => key in sample);
    const optional = present.length < samples.length ? '?' : '';
    const type = unionType(present.map((sample) => sample[key]), key, interfaces);
    return `  ${propertyName(key)}${optional}: ${type};`;
  });
  return slot.name;
}

function arrayType(elements, name, interfaces) {
  if (!elements.length) return 'unknown[]';
  const element = unionType(elements, singular(name), interfaces);
  return element.includes('|') ? `(${element})[]` : `${element}[]`;
}

// Every value seen at one position is folded into a single type, so an array of
// objects produces one merged interface rather than one per element.
function unionType(values, name, interfaces) {
  const objects = values.filter(isPlainObject);
  const arrays = values.filter(Array.isArray);
  const scalars = values.filter((value) => !isPlainObject(value) && !Array.isArray(value));

  const types = [];
  if (objects.length) types.push(objectType(objects, name, interfaces));
  if (arrays.length) types.push(arrayType(arrays.flat(), name, interfaces));
  types.push(...scalars.map(scalarType));
  return [...new Set(types)].join(' | ') || 'unknown';
}

function jsonToTypes(source) {
  const value = JSON.parse(source);
  const interfaces = createInterfaces();

  if (isPlainObject(value)) {
    objectType([value], 'Root', interfaces);
    return interfaces.render();
  }
  const alias = Array.isArray(value) ? arrayType(value, 'RootItem', interfaces) : scalarType(value);
  return [interfaces.render(), `type Root = ${alias};`].filter(Boolean).join('\n\n');
}

// --- Cron expression ---
const RUN_COUNT = 5;
const runFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
});

function cronMount(body) {
  const field = h('input', { class: 'url-field', spellcheck: 'false', placeholder: '*/15 9-17 * * mon-fri' });
  const error = h('div', { class: 'io-error' });
  const meaning = h('div', { class: 'cron-meaning' });
  const caveat = h('p', { class: 'tool-hint' });
  const runs = Array.from({ length: RUN_COUNT }, (_, index) => keyValueRow(index === 0 ? 'Next run' : `+${index}`));
  const runList = h('div', { class: 'kv-list' }, ...runs.map(({ row }) => row));

  const run = () => {
    error.textContent = '';
    caveat.textContent = '';
    meaning.textContent = '';
    runs.forEach(({ value }) => { value.textContent = '—'; });
    if (!field.value.trim()) return;

    let fields;
    try {
      fields = parseCron(field.value);
    } catch (e) {
      error.textContent = e.message;
      return;
    }

    meaning.textContent = describeCron(fields);
    if (daysAreEitherOr(fields)) {
      caveat.textContent = 'Both day fields are restricted, so cron fires when either one matches, not only when both do.';
    }
    const upcoming = nextRuns(fields, new Date(), RUN_COUNT);
    runs.forEach(({ value }, index) => {
      value.textContent = upcoming[index]
        ? runFormat.format(upcoming[index])
        : `nothing more within ${HORIZON_YEARS} years`;
    });
  };

  field.addEventListener('input', run);

  body.append(
    h('p', { class: 'tool-hint' }, 'Five fields: minute, hour, day-of-month, month, day-of-week. Names (mon, jan), ranges, steps and @daily-style shorthands all work.'),
    h('div', { class: 'io-box' },
      h('div', { class: 'io-label-row' }, h('span', { class: 'io-label' }, 'Expression'), copyBtn(() => field.value)),
      field,
      error,
    ),
    h('div', { class: 'io-box' }, h('div', { class: 'io-label' }, 'Meaning'), meaning, caveat),
    h('div', { class: 'io-box' }, h('div', { class: 'io-label' }, `Next ${RUN_COUNT} runs (your local time)`), runList),
  );
  field.focus();
}

export default [
  {
    id: 'curl-fetch', category: 'Code', name: 'cURL → fetch', title: 'cURL to fetch()',
    desc: 'Turn a copied cURL command into a fetch() call, headers and body included.',
    mount: transformTool({
      live: true, inputLabel: 'cURL command', outputLabel: 'JavaScript', downloadName: 'request.js',
      placeholder: 'curl -X POST https://api.example.com/users \\\n  -H \'content-type: application/json\' \\\n  -d \'{"name":"Ada"}\'',
      transform: curlToFetch,
    }),
  },
  {
    id: 'json-types', category: 'Code', name: 'JSON → TypeScript', title: 'JSON to TypeScript',
    desc: 'Generate interfaces from a JSON sample. Array elements are merged into one shape, and keys missing from some elements become optional.',
    mount: transformTool({
      live: true, inputLabel: 'JSON', outputLabel: 'TypeScript', downloadName: 'types.ts',
      placeholder: '{"id":1,"name":"Ada","tags":["admin"],"team":{"slug":"core"}}',
      transform: jsonToTypes,
    }),
  },
  {
    id: 'cron-explain', category: 'Code', name: 'Cron Expression', title: 'Cron Expression Explainer',
    desc: 'Read a cron schedule back in plain English, and see when it fires next.',
    mount: cronMount,
  },
];
