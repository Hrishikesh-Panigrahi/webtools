import './styles/base.css';
import './styles/components.css';
import { h } from './dom.js';
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

// ---------- Shell ----------
const search = h('input', { class: 'search', placeholder: 'Search tools…', spellcheck: 'false' });
const navList = h('div', { class: 'nav' });
const sidebar = h('nav', { class: 'sidebar', id: 'sidebar' }, search, navList);
const backdrop = h('div', { class: 'sidebar-backdrop' });
const main = h('main', { class: 'main' });

const menuBtn = h('button', { class: 'btn-icon menu-toggle', 'aria-label': 'Menu', html: menuIcon });
const themeBtn = h('button', { class: 'btn-icon', 'aria-label': 'Toggle theme', title: 'Toggle theme' });
const setThemeIcon = () => { themeBtn.innerHTML = document.documentElement.getAttribute('data-theme') === 'dark' ? sunIcon : moonIcon; };
setThemeIcon();

const header = h('header', { class: 'header' },
  h('div', { class: 'header-left' },
    menuBtn,
    h('a', { class: 'logo', href: '#' + tools[0].id }, 'webTools'),
  ),
  h('div', { class: 'header-right' }, themeBtn),
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

    const label = h('button', { class: 'nav-group-label', type: 'button' },
      h('span', { class: 'chevron', html: chevronIcon }), cat);
    const itemsWrap = h('div', { class: 'nav-items' });
    for (const t of items) {
      itemsWrap.append(h('a', { class: 'nav-item', href: '#' + t.id, 'data-id': t.id }, t.name));
      shown++;
    }
    // While searching, keep every matching group open.
    const isCollapsed = !q && collapsed.has(cat);
    const group = h('div', { class: 'nav-group' + (isCollapsed ? ' collapsed' : '') }, label, itemsWrap);
    label.addEventListener('click', () => {
      const nowCollapsed = group.classList.toggle('collapsed');
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
function currentId() {
  const id = location.hash.replace(/^#/, '');
  return byId[id] ? id : tools[0].id;
}

function render() {
  const tool = byId[currentId()];
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
search.addEventListener('input', () => buildNav(search.value));
window.addEventListener('hashchange', render);
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    e.preventDefault(); search.focus();
  }
});

buildNav();
if (!location.hash) location.hash = '#' + tools[0].id;
render();
