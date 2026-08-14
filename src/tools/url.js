import { h, copyBtn, icons } from '../dom.js';

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
    const k = h('input', { class: 'param-input', spellcheck: 'false', placeholder: 'key', value: key, 'data-no-persist': true });
    const v = h('input', { class: 'param-input', spellcheck: 'false', placeholder: 'value', value: value, 'data-no-persist': true });
    const del = h('button', { class: 'btn-icon-sm', type: 'button', title: 'Remove', html: icons.trash });
    const row = h('div', { class: 'param-row' }, k, v, del);
    k.addEventListener('input', rebuild);
    v.addEventListener('input', rebuild);
    del.addEventListener('click', () => { row.remove(); rebuild(); });
    paramRows.append(row);
  };

  function collectParams() {
    return [...paramRows.querySelectorAll('.param-row')]
      .map((r) => {
        const [k, v] = r.querySelectorAll('.param-input');
        return { key: k.value, value: v.value };
      })
      .filter((p) => p.key !== '');
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
      .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
      .join('&');

    urlField.value =
      `${proto}://${credentials}${host}${port ? ':' + port : ''}${path}` +
      `${query ? '?' + query : ''}${frag ? '#' + frag : ''}`;
  }

  // Parse the URL string into the structured fields + param table.
  function parse() {
    const raw = urlField.value.trim();
    if (!raw) return;
    let u;
    try {
      u = new URL(raw);
    } catch {
      error.textContent = 'Invalid URL — include a protocol, e.g. https://…';
      return;
    }
    error.textContent = '';
    credentials = u.username ? `${u.username}${u.password ? ':' + u.password : ''}@` : '';
    parts.protocol.input.value = u.protocol.replace(/:$/, '');
    parts.host.input.value = u.hostname;
    parts.port.input.value = u.port;
    parts.path.input.value = u.pathname === '/' && !raw.includes(u.host + '/') ? '' : u.pathname;
    parts.hash.input.value = u.hash.replace(/^#/, '');
    paramRows.innerHTML = '';
    for (const [k, v] of u.searchParams) addParamRow(k, v);
    addParamRow(); // trailing empty row to add a new one
  }

  urlField.addEventListener('change', parse);
  urlField.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); parse(); } });
  addParamRow(); // start with one empty row so the table is ready to use

  body.append(
    h('div', { class: 'io-box' },
      h('div', { class: 'io-label-row' },
        h('span', { class: 'io-label' }, 'URL'),
        copyBtn(() => urlField.value),
      ),
      urlField,
      error,
      h('div', { class: 'tool-actions', style: 'margin-top:.6rem' },
        h('button', { class: 'btn btn-primary', type: 'button', onClick: parse }, 'Parse'),
        h('span', { class: 'kbd-hint' }, 'Edit the fields below to rebuild the URL live'),
      ),
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
    desc: 'Break a URL into editable parts. Change any field or query parameter and the full URL rebuilds instantly.',
    mount: urlParserMount,
  },
];
