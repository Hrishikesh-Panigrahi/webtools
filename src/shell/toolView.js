// One tool on screen: its header and toolbar, its mounted body, and the
// wiring every tool gets for free — saved state, hand-offs from other tools,
// resizable panes and accessible names.

import { h, setField } from '../ui/dom.js';
import { icons, categoryIcons } from '../ui/icons.js';
import { copyText } from '../ui/buttons.js';
import { toast } from '../ui/toast.js';
import { makeSplittable } from '../ui/split.js';
import { takeHandOff } from '../navigation.js';
import { findSecret } from '../lib/security.js';
import { formatBytes } from '../lib/format.js';
import { isPinned, togglePinned, recordVisit, onPrefsChange } from './prefs.js';
import { restoreState, bindStateSaving, serializeControls, encodeState, primaryField } from './toolState.js';
import { readText, writeText } from './storage.js';

// Pane widths are remembered per tool, like the inputs: a tree view earns a
// wider output pane, while an encoder is usually happiest at half and half.
const SPLIT_PREFIX = 'webtools-split:';
// A link this long still works when opened, but chat apps and trackers tend to truncate it.
const LONG_LINK_CHARS = 8000;

function wireSplitters(body, tool) {
  const saved = Number(readText(SPLIT_PREFIX + tool.id));
  const ratio = saved > 0 && saved < 1 ? saved : undefined;
  for (const grid of body.querySelectorAll('.io-grid')) {
    if (grid.childElementCount !== 2) continue;
    makeSplittable(grid, { ratio, onChange: (next) => writeText(SPLIT_PREFIX + tool.id, String(next)) });
  }
}

/**
 * Give every control an accessible name.
 *
 * Tools label their fields visually — an `.io-label` above a textarea, a
 * `.part-label` beside a row — which reads correctly on screen but leaves a
 * screen reader announcing a bare "edit text". Rather than making every tool
 * mint ids and `<label for>` pairs, the shell borrows the nearest visible label
 * once the tool has mounted.
 */
function nameControls(body) {
  const LABEL_SELECTOR = '.part-label, .kv-label, .io-label';
  const labelFor = (control) => {
    const row = control.closest('.color-out-row, .part-row, .param-row, .qr-control, .gradient-stop, .kv-row');
    const rowLabel = row?.querySelector(LABEL_SELECTOR)?.textContent.trim();
    if (rowLabel) return rowLabel;
    // Control rows put the caption immediately before the control it describes.
    const previous = control.previousElementSibling;
    if (previous?.matches(LABEL_SELECTOR)) return previous.textContent.trim();
    return control.closest('.io-box')?.querySelector('.io-label')?.textContent.trim() || null;
  };

  for (const control of body.querySelectorAll('input:not([type=hidden]), select, textarea')) {
    const isNamed = control.getAttribute('aria-label') || control.getAttribute('title')
      || control.getAttribute('placeholder') || control.closest('label');
    if (isNamed) continue;
    const name = labelFor(control);
    if (name) control.setAttribute('aria-label', name);
  }
}

/** Copy a link that reopens `tool` with the input in `body`, warning when it carries a credential. */
export async function copyShareLink(tool, body) {
  const values = serializeControls(body);
  history.replaceState(null, '', `#${tool.id}${values.length ? '?' + encodeState(values) : ''}`);
  await copyText(location.href);
  const secret = values.map((value) => (typeof value === 'string' ? findSecret(value) : null)).find(Boolean);
  if (secret) toast(`Link copied — careful, it contains ${secret}. Anyone with the link can read it.`);
  else if (location.href.length > LONG_LINK_CHARS) toast(`Link copied — it carries ${formatBytes(location.href.length)} of input, so some apps may cut it short`);
  else toast('Link copied, with your current input');
}

function toolHeader(tool, { onShare, onReset }) {
  const pinButton = h('button', { class: 'btn-icon tool-action', type: 'button', html: icons.star });
  const paintPin = () => {
    const pinned = isPinned(tool.id);
    pinButton.classList.toggle('is-pinned', pinned);
    pinButton.setAttribute('aria-pressed', String(pinned));
    pinButton.title = pinned ? 'Unpin from the sidebar' : 'Pin to the sidebar';
    pinButton.setAttribute('aria-label', pinButton.title);
  };
  pinButton.addEventListener('click', () => toast(togglePinned(tool.id) ? `Pinned ${tool.title}` : `Unpinned ${tool.title}`));
  paintPin();

  const actionButton = (iconHtml, label, onClick) =>
    h('button', { class: 'btn-icon tool-action', type: 'button', html: iconHtml, 'aria-label': label, title: label, onClick });

  const element = h('header', { class: 'tool-header' },
    h('div', { class: 'tool-heading' },
      h('div', { class: 'tool-eyebrow' }, h('span', { class: 'tool-eyebrow-icon', html: categoryIcons[tool.category] ?? '' }), tool.category),
      h('h1', { class: 'tool-title' }, tool.title),
      h('p', { class: 'tool-desc' }, tool.desc),
    ),
    h('div', { class: 'tool-toolbar' },
      pinButton,
      actionButton(icons.link, 'Copy a link to this tool with its current input', onShare),
      actionButton(icons.reset, 'Reset this tool', onReset),
    ),
  );
  const unsubscribe = onPrefsChange((kind) => { if (kind === 'pinned') paintPin(); });
  return { element, dispose: unsubscribe };
}

/**
 * Render `tool` into `container`.
 * @param {Object} options
 * @param {string} options.query      the hash query, which may carry shared state
 * @param {() => void} options.onReset
 * @returns {{ kind: 'tool', tool: Object, body: HTMLElement, dispose(): void }}
 */
export function renderToolView(container, tool, { query, onReset }) {
  const body = h('div', { class: 'tool-body' });
  const header = toolHeader(tool, { onShare: () => copyShareLink(tool, body), onReset });
  container.append(h('section', { class: 'tool-panel' }, header.element, body));

  tool.mount(body);
  restoreState(body, tool, query);
  const stopSaving = bindStateSaving(body, tool);
  const handedOff = takeHandOff();
  const field = handedOff != null ? primaryField(body) : null;
  if (field) setField(field, handedOff);
  wireSplitters(body, tool);
  nameControls(body);
  recordVisit(tool.id);

  return {
    kind: 'tool',
    tool,
    body,
    dispose() {
      stopSaving();
      header.dispose();
    },
  };
}
