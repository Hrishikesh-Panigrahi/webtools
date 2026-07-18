import { h } from '../dom.js';
import { transformTool } from '../panel.js';

function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, k) => {
      acc[k] = sortDeep(value[k]);
      return acc;
    }, {});
  }
  return value;
}

// Validate is a little custom: pass/fail card instead of an output box.
function validateMount(body) {
  const input = h('textarea', { class: 'io-textarea', placeholder: '{"valid": true}', spellcheck: 'false' });
  const result = h('div', { class: 'validate-result' });

  const run = () => {
    const val = input.value.trim();
    if (!val) { result.className = 'validate-result'; result.innerHTML = ''; return; }
    try {
      JSON.parse(val);
      result.className = 'validate-result show ok';
      result.innerHTML = '<span class="validate-icon">✓</span><div><div class="validate-title">Valid JSON</div></div>';
    } catch (e) {
      result.className = 'validate-result show bad';
      result.innerHTML = `<span class="validate-icon">✕</span><div><div class="validate-title">Invalid JSON</div><div class="validate-msg"></div></div>`;
      result.querySelector('.validate-msg').textContent = e.message;
    }
  };

  input.addEventListener('input', run);
  body.append(
    h('div', { class: 'io-box' }, h('div', { class: 'io-label' }, 'JSON'), input),
    result,
  );
  input.focus();
}

export default [
  {
    id: 'json-prettify', category: 'JSON', name: 'Prettify', title: 'JSON Prettify',
    desc: 'Format and indent JSON for readability. Key order is preserved.',
    mount: transformTool({
      actionLabel: 'Prettify', placeholder: '{"name":"Alice","age":30}',
      transform: (s) => JSON.stringify(JSON.parse(s), null, 2),
    }),
  },
  {
    id: 'json-minify', category: 'JSON', name: 'Minify', title: 'JSON Minify',
    desc: 'Strip all unnecessary whitespace to produce the smallest valid JSON.',
    mount: transformTool({
      actionLabel: 'Minify', placeholder: '{\n  "name": "Alice",\n  "age": 30\n}',
      transform: (s) => JSON.stringify(JSON.parse(s)),
    }),
  },
  {
    id: 'json-validate', category: 'JSON', name: 'Validate', title: 'JSON Validate',
    desc: 'Check whether your JSON is syntactically valid, live as you type.',
    mount: validateMount,
  },
  {
    id: 'json-sort', category: 'JSON', name: 'Sort Keys', title: 'JSON Sort Keys',
    desc: 'Recursively sort every object key alphabetically. Arrays keep their order.',
    mount: transformTool({
      actionLabel: 'Sort', placeholder: '{"b":2,"a":1,"c":{"z":1,"y":2}}',
      transform: (s) => JSON.stringify(sortDeep(JSON.parse(s)), null, 2),
    }),
  },
];
