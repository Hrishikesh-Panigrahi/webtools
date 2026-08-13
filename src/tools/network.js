import { h, copyBtn } from '../dom.js';
import { describeAddress, splitSubnets } from '../ip.js';
import { parseUserAgent } from '../useragent.js';

const resultRow = (label, value) => h('div', { class: 'kv-row' },
  h('span', { class: 'kv-label' }, label),
  h('span', { class: 'kv-value selectable' }, value));

// --- IP / CIDR calculator ---

const SUBNET_LIMIT = 64;

function ipMount(body) {
  const field = h('input', { class: 'url-field', spellcheck: 'false', placeholder: '10.0.0.1/24 · 192.168.1.5 255.255.255.0 · 2001:db8::1/48' });
  const splitInto = h('input', { class: 'part-input', type: 'number', min: '1', max: '128', placeholder: 'split into /n' });
  const error = h('div', { class: 'io-error' });
  const facts = h('div', { class: 'kv-list' });
  const subnetBox = h('div', { class: 'io-box', hidden: true });

  let rows = [];
  const asText = () => rows.map(([label, value]) => `${label}: ${value}`).join('\n');

  const renderSubnets = () => {
    const newPrefix = Number(splitInto.value);
    subnetBox.hidden = !newPrefix;
    if (!newPrefix) return;
    subnetBox.innerHTML = '';
    try {
      const { total, subnets } = splitSubnets(field.value, newPrefix, SUBNET_LIMIT);
      const shown = subnets.length < total ? ` — showing the first ${subnets.length}` : '';
      subnetBox.append(
        h('div', { class: 'io-label' }, `${total.toLocaleString()} subnet${total === 1 ? '' : 's'} of /${newPrefix}${shown}`),
        h('div', { class: 'kv-list' }, ...subnets.map((subnet) => resultRow(subnet.network, subnet.range))),
      );
    } catch (failure) {
      subnetBox.append(h('div', { class: 'io-error' }, failure.message));
    }
  };

  const run = () => {
    error.textContent = '';
    facts.innerHTML = '';
    subnetBox.hidden = true;
    if (!field.value.trim()) { rows = []; return; }
    try {
      const result = describeAddress(field.value);
      rows = result.rows;
      facts.append(...rows.map(([label, value]) => resultRow(label, value)));
      splitInto.max = String(result.version === 6 ? 128 : 32);
      renderSubnets();
    } catch (failure) {
      rows = [];
      error.textContent = failure.message;
    }
  };

  field.addEventListener('input', run);
  splitInto.addEventListener('input', run);

  body.append(
    h('div', { class: 'io-box' },
      h('div', { class: 'io-label-row' },
        h('span', { class: 'io-label' }, 'Address, with an optional prefix or netmask'),
        copyBtn(asText),
      ),
      h('div', { class: 'color-input-row' }, field, splitInto),
      error,
    ),
    facts,
    subnetBox,
    h('p', { class: 'tool-hint' }, 'Accepts CIDR, a dotted netmask, or a bare address. Set a smaller prefix in the second box to carve the network into subnets.'),
  );
  field.focus();
}

// --- User-Agent parser ---

function userAgentMount(body) {
  const field = h('textarea', { class: 'io-textarea', spellcheck: 'false', placeholder: 'Mozilla/5.0 (…) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/…' });
  const error = h('div', { class: 'io-error' });
  const facts = h('div', { class: 'kv-list' });
  const notes = h('div', { class: 'ua-notes' });
  const badge = h('span', { class: 'ua-badge', hidden: true });

  const useMine = h('button', {
    class: 'btn btn-ghost btn-sm', type: 'button',
    onClick: () => {
      field.value = navigator.userAgent;
      field.dispatchEvent(new Event('input', { bubbles: true }));
    },
  }, 'Use mine');

  const run = () => {
    error.textContent = '';
    facts.innerHTML = '';
    notes.innerHTML = '';
    badge.hidden = true;
    if (!field.value.trim()) return;
    try {
      const { rows, isBot, notes: hints } = parseUserAgent(field.value);
      facts.append(...rows.map(([label, value]) => resultRow(label, value)));
      badge.hidden = false;
      badge.textContent = isBot ? 'Automated client' : 'Human browser';
      badge.classList.toggle('bot', isBot);
      notes.append(...hints.map((hint) => h('p', { class: 'tool-hint' }, hint)));
    } catch (failure) {
      error.textContent = failure.message;
    }
  };

  field.addEventListener('input', run);

  body.append(
    h('div', { class: 'io-box' },
      h('div', { class: 'io-label-row' },
        h('span', { class: 'io-label' }, 'User-Agent string'),
        h('div', { class: 'io-actions' }, badge, useMine),
      ),
      field,
      error,
    ),
    facts,
    notes,
  );
  field.focus();
}

export default [
  {
    id: 'net-ip', category: 'Network', name: 'IP / CIDR', title: 'IP Subnet Calculator',
    desc: 'Work out the network, broadcast, mask and host range for any IPv4 or IPv6 block — and split it into subnets.',
    mount: ipMount,
  },
  {
    id: 'net-useragent', category: 'Network', name: 'User-Agent', title: 'User-Agent Parser',
    desc: 'Break a User-Agent string into browser, engine, OS and device, and tell a bot from a person.',
    mount: userAgentMount,
  },
];
