import { h, setField } from '../ui/dom.js';
import { icons } from '../ui/icons.js';
import { copyButton } from '../ui/buttons.js';

// Editable URL parser: break a URL into parts + a query-param table.
// Edit any field or param and the full URL rebuilds live. Paste a URL and
// press "Parse" (or Enter) to populate the fields.
function urlParserMount(body) {
  const urlField = h('input', { class: 'url-field', spellcheck: 'false', placeholder: 'https://user@host:port/path?key=value#hash' });
  const error = h('div', { class: 'io-error' });

  const field = (key, label, placeholder = '') => {
    const input = h('input', { class: 'part-input', spellcheck: 'false', placeholder, 'data-no-persist': true });
    input.addEventListener('input', rebuild);
    return { key, label, input, row: h('label', { class: 'part-row' }, h('span', { class: 'part-label' }, label), input) };
  };

  const parts = {
    protocol: field('protocol', 'Protocol', 'https'),
    host: field('host', 'Host', 'example.com'),
    port: field('port', 'Port', '443'),
    path: field('path', 'Path', '/path'),
    hash: field('hash', 'Fragment', 'section'),
  };

  const paramRows = h('div', { class: 'param-rows' });

  // `user:pass@` has no field of its own, but a pasted URL keeps it so editing
  // any other part never silently strips the credentials.
  let credentials = '';

  const addParamRow = (key = '', value = '') => {
    const keyField = h('input', { class: 'param-input', spellcheck: 'false', placeholder: 'key', value: key, 'data-no-persist': true });
    const valueField = h('input', { class: 'param-input', spellcheck: 'false', placeholder: 'value', value, 'data-no-persist': true });
    const removeButton = h('button', { class: 'btn-icon-sm', type: 'button', title: 'Remove', 'aria-label': 'Remove this parameter', html: icons.trash });
    const row = h('div', { class: 'param-row' }, keyField, valueField, removeButton);
    keyField.addEventListener('input', rebuild);
    valueField.addEventListener('input', rebuild);
    removeButton.addEventListener('click', () => { row.remove(); rebuild(); });
    paramRows.append(row);
  };

  function collectParams() {
    return [...paramRows.querySelectorAll('.param-row')]
      .map((row) => {
        const [keyField, valueField] = row.querySelectorAll('.param-input');
        return { key: keyField.value, value: valueField.value };
      })
      .filter((param) => param.key !== '');
  }

  // Rebuild the URL string from the structured fields.
  function rebuild() {
    error.textContent = '';
    const proto = (parts.protocol.input.value || 'https').replace(/:\/*$/, '');
    const host = parts.host.input.value.trim();
    const port = parts.port.input.value.trim();
    let path = parts.path.input.value;
    if (path && !path.startsWith('/')) path = '/' + path;
    const frag = parts.hash.input.value.replace(/^#/, '');
    const query = collectParams()
      .map((param) => `${encodeURIComponent(param.key)}=${encodeURIComponent(param.value)}`)
      .join('&');

    urlField.value =
      `${proto}://${credentials}${host}${port ? ':' + port : ''}${path}` +
      `${query ? '?' + query : ''}${frag ? '#' + frag : ''}`;
  }

  // Parse the URL string into the structured fields + param table. While
  // typing (`quiet`), a half-written URL leaves the fields alone instead of
  // flashing an error; leaving the field or pressing Enter reports it.
  function parse({ quiet = false } = {}) {
    const raw = urlField.value.trim();
    if (!raw) return;
    let parsed;
    try {
      parsed = new URL(raw);
    } catch {
      if (!quiet) error.textContent = 'Invalid URL. Include a protocol, e.g. https://…';
      return;
    }
    error.textContent = '';
    credentials = parsed.username ? `${parsed.username}${parsed.password ? ':' + parsed.password : ''}@` : '';
    parts.protocol.input.value = parsed.protocol.replace(/:$/, '');
    parts.host.input.value = parsed.hostname;
    parts.port.input.value = parsed.port;
    parts.path.input.value = parsed.pathname === '/' && !raw.includes(parsed.host + '/') ? '' : parsed.pathname;
    parts.hash.input.value = parsed.hash.replace(/^#/, '');
    paramRows.replaceChildren();
    for (const [key, value] of parsed.searchParams) addParamRow(key, value);
    addParamRow(); // trailing empty row to add a new one
  }

  urlField.addEventListener('input', () => { error.textContent = ''; parse({ quiet: true }); });
  urlField.addEventListener('change', () => parse());
  urlField.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); parse(); } });
  addParamRow(); // start with one empty row so the table is ready to use

  body.append(
    h('div', { class: 'io-box' },
      h('div', { class: 'io-label-row' },
        h('span', { class: 'io-label' }, 'URL'),
        h('div', { class: 'io-actions' },
          h('button', {
            class: 'btn-copy', type: 'button', html: icons.sample + ' Example',
            onClick: () => { setField(urlField, 'https://user@api.example.com:8443/v1/search?q=web+tools&page=2&sort=desc#results'); },
          }),
          copyButton(() => urlField.value),
        ),
      ),
      urlField,
      error,
      h('p', { class: 'kbd-hint' }, 'Fields update as you type. Edit any field below and the URL rebuilds.'),
    ),
    h('div', { class: 'url-parts' }, ...Object.values(parts).map((p) => p.row)),
    h('div', { class: 'params-block' },
      h('div', { class: 'io-label-row' },
        h('span', { class: 'io-label' }, 'Query parameters'),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => addParamRow() }, '+ Add'),
      ),
      h('div', { class: 'param-head' }, h('span', {}, 'Key'), h('span', {}, 'Value'), h('span', {})),
      paramRows,
    ),
  );

  parse();
}

export default [
  {
    id: 'url-parse', category: 'URL', name: 'Parser', title: 'URL Parser',
    keywords: 'query string params link uri',
    desc: 'Break a URL into editable parts. Change any field or query parameter and the full URL rebuilds instantly.',
    mount: urlParserMount,
  },
];
