// The tool list: a filter box pinned over collapsible category groups, with
// the user's pinned tools on top. On a phone it is a drawer; on a desktop the
// menu button hides it to give a tool the full width.

import { h } from '../ui/dom.js';
import { icons, categoryIcons } from '../ui/icons.js';
import { highlightMatches } from '../ui/highlight.js';
import { rankTools } from '../lib/fuzzy.js';
import { pinnedIds } from './prefs.js';
import { readJson, writeJson, readText, writeText } from './storage.js';

const COLLAPSED_GROUPS_KEY = 'webtools-collapsed';
const SIDEBAR_KEY = 'webtools-sidebar';
const PHONE_LAYOUT = '(max-width: 820px)';

export const isPhoneLayout = () => matchMedia(PHONE_LAYOUT).matches;

/**
 * @param {Object} options
 * @param {Object[]} options.tools
 * @param {Object<string, Object[]>} options.categories
 * @param {(id:string) => Object|undefined} options.findTool
 * @param {HTMLElement} options.layout  the element whose `sidebar-collapsed` class hides it on a desktop
 */
export function createSidebar({ tools, categories, findTool, layout }) {
  const search = h('input', { class: 'search-input', placeholder: 'Filter tools…', spellcheck: 'false', 'aria-label': 'Filter tools' });
  const navList = h('div', { class: 'nav' });
  const element = h('nav', { class: 'sidebar', id: 'sidebar', 'aria-label': 'Tools' },
    h('div', { class: 'sidebar-head' },
      h('div', { class: 'search-box' },
        h('span', { class: 'search-icon', html: icons.search }),
        search,
        h('kbd', { class: 'search-key' }, '/'),
      ),
    ),
    navList,
  );
  const backdrop = h('div', { class: 'sidebar-backdrop' });
  const savedCollapsed = readJson(COLLAPSED_GROUPS_KEY, []);
  const collapsedGroups = new Set(Array.isArray(savedCollapsed) ? savedCollapsed : []);
  let activeId = null;

  if (readText(SIDEBAR_KEY) === 'collapsed') layout.classList.add('sidebar-collapsed');

  const navItem = (tool, nameIndices) => h('a', { class: 'nav-item', href: '#' + tool.id, 'data-id': tool.id },
    ...highlightMatches(tool.name, nameIndices));

  function navGroup(name, iconHtml, items) {
    const isCollapsed = collapsedGroups.has(name);
    const label = h('button', { class: 'nav-group-label', type: 'button', 'aria-expanded': String(!isCollapsed) },
      h('span', { class: 'nav-group-icon', html: iconHtml ?? '' }),
      h('span', { class: 'nav-group-name' }, name),
      h('span', { class: 'nav-group-count' }, String(items.length)),
      h('span', { class: 'chevron', html: icons.chevron }),
    );
    const group = h('div', { class: 'nav-group' + (isCollapsed ? ' collapsed' : '') }, label, h('div', { class: 'nav-items' }, ...items));
    label.addEventListener('click', () => {
      const isNowCollapsed = group.classList.toggle('collapsed');
      label.setAttribute('aria-expanded', String(!isNowCollapsed));
      if (isNowCollapsed) collapsedGroups.add(name); else collapsedGroups.delete(name);
      writeJson(COLLAPSED_GROUPS_KEY, [...collapsedGroups]);
    });
    return group;
  }

  function paintActive() {
    navList.querySelectorAll('.nav-item').forEach((link) => {
      const isActive = link.dataset.id === activeId;
      link.classList.toggle('active', isActive);
      if (isActive) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    navList.querySelector('.nav-home')?.classList.toggle('active', !activeId);
  }

  // Filtering ranks every tool into one flat list, best match first, so Enter
  // in the filter box can open the top hit.
  function render() {
    const query = search.value.trim();
    navList.replaceChildren();
    if (query) {
      const ranked = rankTools(query, tools);
      navList.append(...ranked.map(({ tool, nameIndices }) => navItem(tool, nameIndices)));
      if (!ranked.length) navList.append(h('div', { class: 'nav-empty' }, 'No tools match.'));
    } else {
      navList.append(h('a', { class: 'nav-home', href: '#' }, h('span', { class: 'nav-group-icon', html: icons.grid }), 'All tools'));
      const pinned = pinnedIds().map(findTool).filter(Boolean);
      if (pinned.length) navList.append(navGroup('Pinned', icons.star, pinned.map((tool) => navItem(tool))));
      for (const [category, list] of Object.entries(categories)) {
        navList.append(navGroup(category, categoryIcons[category], list.map((tool) => navItem(tool))));
      }
    }
    paintActive();
  }

  // Arrow keys move through the visible links, so the list works without a mouse.
  function moveFocus(step) {
    const links = [...navList.querySelectorAll('.nav-home, .nav-item, .nav-group-label')].filter((link) => link.offsetParent !== null);
    const index = links.indexOf(document.activeElement);
    if (index === 0 && step < 0) { search.focus(); return; }
    links[Math.max(0, Math.min(links.length - 1, index + step))]?.focus();
  }

  const open = () => { element.classList.add('open'); backdrop.classList.add('show'); };
  const close = () => { element.classList.remove('open'); backdrop.classList.remove('show'); };

  search.addEventListener('input', render);
  search.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); moveFocus(1); }
    else if (event.key === 'Enter') { event.preventDefault(); navList.querySelector('.nav-item')?.click(); }
    else if (event.key === 'Escape' && search.value) { event.stopPropagation(); search.value = ''; render(); }
  });
  navList.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    moveFocus(event.key === 'ArrowDown' ? 1 : -1);
  });
  backdrop.addEventListener('click', close);
  render();

  return {
    element,
    backdrop,
    render,
    close,
    setActive(id) {
      activeId = id;
      paintActive();
    },
    /** Whether the list is out of sight: a closed drawer, or hidden on a desktop. */
    isHidden: () => (isPhoneLayout() ? !element.classList.contains('open') : layout.classList.contains('sidebar-collapsed')),
    focusSearch: () => search.focus(),
    toggle() {
      if (isPhoneLayout()) {
        if (element.classList.contains('open')) close(); else open();
        return;
      }
      const isCollapsed = layout.classList.toggle('sidebar-collapsed');
      writeText(SIDEBAR_KEY, isCollapsed ? 'collapsed' : 'open');
    },
  };
}
