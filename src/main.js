import './styles/base.css';
import './styles/components.css';
import { h, icons, categoryIcons } from './dom.js';
import { encodeState, decodeState } from './state.js';
import { tools, categories } from './registry.js';

const app = document.getElementById('app');
const byId = Object.fromEntries(tools.map((t) => [t.id, t]));

// ---------- Theme ----------
const THEME_KEY = 'webtools-theme';
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem(THEME_KEY, t);
}
applyTheme(localStorage.getItem(THEME_KEY) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

const sunIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.2" y1="4.2" x2="5.6" y2="5.6"/><line x1="18.4" y1="18.4" x2="19.8" y2="19.8"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.2" y1="19.8" x2="5.6" y2="18.4"/><line x1="18.4" y1="5.6" x2="19.8" y2="4.2"/></svg>`;
const moonIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>`;
const menuIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`;
const chevronIcon = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>`;
const logoIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 8 9 12 5 16"/><line x1="12.5" y1="16" x2="19" y2="16"/></svg>`;

// ---------- Shell ----------
const search = h('input', { class: 'search-input', placeholder: 'Filter tools…', spellcheck: 'false', 'aria-label': 'Filter tools' });
const searchBox = h('div', { class: 'search-box' },
  h('span', { class: 'search-icon', html: icons.search }),
  search,
  h('kbd', { class: 'search-key' }, '/'),
);
const navList = h('div', { class: 'nav' });
const sidebar = h('nav', { class: 'sidebar', id: 'sidebar' },
  h('div', { class: 'sidebar-head' }, searchBox),
  navList,
);
const backdrop = h('div', { class: 'sidebar-backdrop' });
const main = h('main', { class: 'main' });

const menuBtn = h('button', { class: 'btn-icon menu-toggle', 'aria-label': 'Menu', html: menuIcon });
const themeBtn = h('button', { class: 'btn-icon', 'aria-label': 'Toggle theme', title: 'Toggle theme' });
const linkBtn = h('button', { class: 'btn-icon', 'aria-label': 'Copy shareable link', title: 'Copy a link to this tool with its current input', html: icons.link });
const helpBtn = h('button', { class: 'btn-icon', 'aria-label': 'Keyboard shortcuts', title: 'Keyboard shortcuts' }, '?');
const setThemeIcon = () => { themeBtn.innerHTML = document.documentElement.getAttribute('data-theme') === 'dark' ? sunIcon : moonIcon; };
setThemeIcon();

// The command palette was reachable only by knowing the shortcut; a visible
// trigger advertises it, and doubles as the search affordance people look for.
const isMacKeyboard = /Mac|iPhone|iPad/.test(navigator.userAgent);
const paletteBtn = h('button', { class: 'palette-trigger', type: 'button', 'aria-label': 'Jump to a tool' },
  h('span', { class: 'palette-trigger-icon', html: icons.search }),
  h('span', { class: 'palette-trigger-label' }, 'Jump to a tool'),
  h('kbd', { class: 'palette-trigger-key' }, isMacKeyboard ? '⌘K' : 'Ctrl K'),
);

const header = h('header', { class: 'header' },
  h('div', { class: 'header-left' },
    menuBtn,
    h('a', { class: 'logo', href: '#' + tools[0].id },
      h('span', { class: 'logo-mark', html: logoIcon }),
      h('span', { class: 'logo-text' }, 'webTools'),
    ),
  ),
  paletteBtn,
  h('div', { class: 'header-right' }, linkBtn, helpBtn, themeBtn),
);

const bodyWrap = h('div', { class: 'body' }, sidebar, main);
app.append(header, backdrop, bodyWrap);

// ---------- Sidebar ----------
const COLLAPSE_KEY = 'webtools-collapsed';
const collapsed = new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '[]'));
const saveCollapsed = () => localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...collapsed]));

function buildNav(filter = '') {
  navList.innerHTML = '';
  const q = filter.trim().toLowerCase();
  let shown = 0;
  for (const [cat, list] of Object.entries(categories)) {
    const items = list.filter((t) => !q || t.name.toLowerCase().includes(q) || t.title.toLowerCase().includes(q) || cat.toLowerCase().includes(q));
    if (!items.length) continue;

    // While searching, keep every matching group open.
    const isCollapsed = !q && collapsed.has(cat);
    const label = h('button', {
      class: 'nav-group-label', type: 'button', 'aria-expanded': String(!isCollapsed),
    },
      h('span', { class: 'nav-group-icon', html: categoryIcons[cat] ?? '' }),
      h('span', { class: 'nav-group-name' }, cat),
      h('span', { class: 'nav-group-count' }, String(items.length)),
      h('span', { class: 'chevron', html: chevronIcon }),
    );
    const itemsWrap = h('div', { class: 'nav-items' });
    for (const t of items) {
      itemsWrap.append(h('a', { class: 'nav-item', href: '#' + t.id, 'data-id': t.id }, t.name));
      shown++;
    }
    const group = h('div', { class: 'nav-group' + (isCollapsed ? ' collapsed' : '') }, label, itemsWrap);
    label.addEventListener('click', () => {
      const nowCollapsed = group.classList.toggle('collapsed');
      label.setAttribute('aria-expanded', String(!nowCollapsed));
      if (nowCollapsed) collapsed.add(cat); else collapsed.delete(cat);
      saveCollapsed();
    });
    navList.append(group);
  }
  if (!shown) navList.append(h('div', { class: 'nav-empty' }, 'No tools match.'));
  highlightActive();
}

function highlightActive() {
  const id = currentId();
  navList.querySelectorAll('.nav-item').forEach((a) => a.classList.toggle('active', a.dataset.id === id));
}

// ---------- Routing ----------
// A hash is `#id` or `#id?s=<encoded state>` (shared links carry input state).
function parseHash() {
  const raw = location.hash.replace(/^#/, '');
  const q = raw.indexOf('?');
  const id = q === -1 ? raw : raw.slice(0, q);
  return { id: byId[id] ? id : tools[0].id, query: q === -1 ? '' : raw.slice(q + 1) };
}
function currentId() { return parseHash().id; }

// ---------- Tool state: persistence + shareable links ----------
const STATE_PREFIX = 'webtools-input:';

// The editable controls whose values define a tool's state (skip outputs and
// dynamically-rebuilt fields, which restore themselves from their source).
function editableControls(body) {
  return [...body.querySelectorAll('input, textarea, select')].filter((el) => {
    if (el.matches('[data-no-persist]') || el.readOnly) return false;
    if (el.tagName === 'INPUT') {
      return !['button', 'submit', 'reset', 'file', 'color', 'image'].includes((el.type || 'text').toLowerCase());
    }
    return true;
  });
}
const readControl = (el) => (el.type === 'checkbox' ? el.checked : el.value);
const writeControl = (el, v) => { if (el.type === 'checkbox') el.checked = !!v; else el.value = v; };
const serialize = (body) => editableControls(body).map(readControl);

// Apply saved values, then nudge the tool's own listeners so output recomputes.
function applyState(body, values) {
  const controls = editableControls(body);
  if (!Array.isArray(values) || values.length !== controls.length) return false;
  controls.forEach((el, i) => writeControl(el, values[i]));
  controls.forEach((el) => {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  // Button-driven tools compute on Ctrl+Enter — trigger it once on the first field.
  controls[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
  return true;
}

function restoreState(body, id, query) {
  const shared = decodeState(query);
  if (shared && applyState(body, shared)) return;
  const saved = localStorage.getItem(STATE_PREFIX + id);
  if (saved) { try { applyState(body, JSON.parse(saved)); } catch { /* ignore corrupt state */ } }
}

function bindStateSaving(body, id) {
  const save = () => {
    try { localStorage.setItem(STATE_PREFIX + id, JSON.stringify(serialize(body))); }
    catch { /* quota exceeded (e.g. a huge dropped file) — skip persistence */ }
  };
  body.addEventListener('input', save);
  body.addEventListener('change', save);
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
  const labelFor = (el) => {
    const row = el.closest('.color-out-row, .part-row, .param-row, .qr-control, .gradient-stop, .kv-row');
    const rowLabel = row?.querySelector(LABEL_SELECTOR)?.textContent.trim();
    if (rowLabel) return rowLabel;
    // Control rows put the caption immediately before the control it describes.
    const previous = el.previousElementSibling;
    if (previous?.matches(LABEL_SELECTOR)) return previous.textContent.trim();
    return el.closest('.io-box')?.querySelector('.io-label')?.textContent.trim() || null;
  };

  for (const el of body.querySelectorAll('input:not([type=hidden]), select, textarea')) {
    const named = el.getAttribute('aria-label') || el.getAttribute('title')
      || el.getAttribute('placeholder') || el.closest('label');
    if (named) continue;
    const name = labelFor(el);
    if (name) el.setAttribute('aria-label', name);
  }
}

// Drop a text file onto any editable textarea to load its contents.
function wireFileDrop(body) {
  body.querySelectorAll('textarea:not([readonly])').forEach((ta) => {
    ta.addEventListener('dragover', (e) => { e.preventDefault(); ta.classList.add('dragover'); });
    ta.addEventListener('dragleave', () => ta.classList.remove('dragover'));
    ta.addEventListener('drop', (e) => {
      e.preventDefault();
      ta.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        ta.value = reader.result;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        // Button-driven tools (e.g. Prettify) compute on Ctrl+Enter — nudge them.
        ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
      };
      reader.readAsText(file);
    });
  });
}

let currentBody = null;

function render() {
  const { id, query } = parseHash();
  const tool = byId[id];
  document.title = `${tool.title} · webTools`;
  main.innerHTML = '';
  const body = h('div', { class: 'tool-body' });
  main.append(
    h('section', { class: 'tool-panel' },
      h('header', { class: 'tool-header' },
        h('h1', { class: 'tool-title' }, tool.title),
        h('p', { class: 'tool-desc' }, tool.desc),
      ),
      body,
    ),
  );
  tool.mount(body);
  currentBody = body;
  restoreState(body, id, query);
  bindStateSaving(body, id);
  wireFileDrop(body);
  nameControls(body);
  main.scrollTop = 0;
  highlightActive();
  closeSidebar();
}

// ---------- Sidebar open/collapse ----------
// Mobile: the menu button slides a drawer in/out.
// Desktop: it collapses the sidebar to give the tools full width.
const isMobile = () => matchMedia('(max-width: 820px)').matches;
const openSidebar = () => { sidebar.classList.add('open'); backdrop.classList.add('show'); };
const closeSidebar = () => { sidebar.classList.remove('open'); backdrop.classList.remove('show'); };

const SIDEBAR_KEY = 'webtools-sidebar';
if (localStorage.getItem(SIDEBAR_KEY) === 'collapsed') bodyWrap.classList.add('sidebar-collapsed');

// ---------- Command palette ----------
const paletteInput = h('input', { class: 'palette-input', placeholder: 'Jump to a tool…', spellcheck: 'false' });
const paletteList = h('div', { class: 'palette-list' });
const palette = h('div', { class: 'overlay' }, h('div', { class: 'palette', role: 'dialog' }, paletteInput, paletteList));
let paletteItems = [];
let paletteSel = 0;

function markPaletteSel() {
  paletteItems.forEach((it, i) => it.el.classList.toggle('sel', i === paletteSel));
  paletteItems[paletteSel]?.el.scrollIntoView({ block: 'nearest' });
}
function setPaletteSel(i) {
  if (!paletteItems.length) return;
  paletteSel = Math.max(0, Math.min(i, paletteItems.length - 1));
  markPaletteSel();
}
function buildPalette(filter = '') {
  paletteList.innerHTML = '';
  paletteItems = [];
  const q = filter.trim().toLowerCase();
  for (const t of tools) {
    if (q && !(t.name.toLowerCase().includes(q) || t.title.toLowerCase().includes(q) || t.category.toLowerCase().includes(q))) continue;
    const el = h('button', { class: 'palette-item', type: 'button' },
      h('span', { class: 'palette-name' }, t.name),
      h('span', { class: 'palette-cat' }, t.category));
    const idx = paletteItems.length;
    el.addEventListener('click', () => selectPalette(t.id));
    el.addEventListener('mousemove', () => setPaletteSel(idx));
    paletteList.append(el);
    paletteItems.push({ el, id: t.id });
  }
  if (!paletteItems.length) paletteList.append(h('div', { class: 'nav-empty' }, 'No tools match.'));
  paletteSel = 0;
  markPaletteSel();
}
const openPalette = () => { palette.classList.add('open'); paletteInput.value = ''; buildPalette(); paletteInput.focus(); };
const closePalette = () => palette.classList.remove('open');
function selectPalette(id) { closePalette(); location.hash = '#' + id; }
paletteInput.addEventListener('input', () => buildPalette(paletteInput.value));
paletteInput.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); setPaletteSel(paletteSel + 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); setPaletteSel(paletteSel - 1); }
  else if (e.key === 'Enter') { e.preventDefault(); if (paletteItems[paletteSel]) selectPalette(paletteItems[paletteSel].id); }
});
palette.addEventListener('click', (e) => { if (e.target === palette) closePalette(); });

// ---------- Shortcut help ----------
const shortcuts = [
  ['⌘K / Ctrl K', 'Open the command palette'],
  ['/', 'Focus the search box'],
  ['⌘↵ / Ctrl ↵', 'Run the current tool'],
  ['?', 'Show this help'],
  ['Esc', 'Close a dialog'],
];
const help = h('div', { class: 'overlay' },
  h('div', { class: 'help', role: 'dialog' },
    h('h2', { class: 'help-title' }, 'Keyboard shortcuts'),
    ...shortcuts.map(([keys, desc]) => h('div', { class: 'help-row' },
      h('kbd', { class: 'help-keys' }, keys), h('span', {}, desc))),
  ),
);
const openHelp = () => help.classList.add('open');
const closeHelp = () => help.classList.remove('open');
help.addEventListener('click', (e) => { if (e.target === help) closeHelp(); });
app.append(palette, help);

// ---------- Wire up ----------
menuBtn.addEventListener('click', () => {
  if (isMobile()) {
    sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
  } else {
    const c = bodyWrap.classList.toggle('sidebar-collapsed');
    localStorage.setItem(SIDEBAR_KEY, c ? 'collapsed' : 'open');
  }
});
backdrop.addEventListener('click', closeSidebar);
themeBtn.addEventListener('click', () => {
  applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  setThemeIcon();
});
helpBtn.addEventListener('click', openHelp);
paletteBtn.addEventListener('click', openPalette);
linkBtn.addEventListener('click', async () => {
  if (!currentBody) return;
  const values = serialize(currentBody);
  const hash = '#' + currentId() + (values.length ? '?' + encodeState(values) : '');
  history.replaceState(null, '', hash);
  try { await navigator.clipboard.writeText(location.href); } catch { /* clipboard blocked */ }
  linkBtn.classList.add('copied');
  clearTimeout(linkBtn._t);
  linkBtn._t = setTimeout(() => linkBtn.classList.remove('copied'), 1200);
});
search.addEventListener('input', () => buildNav(search.value));
window.addEventListener('hashchange', render);
document.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    palette.classList.contains('open') ? closePalette() : openPalette();
  } else if (e.key === 'Escape') {
    closePalette(); closeHelp(); closeSidebar();
  } else if (e.key === '/' && !typing) {
    e.preventDefault(); search.focus();
  } else if (e.key === '?' && !typing) {
    e.preventDefault(); openHelp();
  }
});

buildNav();
if (!location.hash) location.hash = '#' + tools[0].id;
render();
