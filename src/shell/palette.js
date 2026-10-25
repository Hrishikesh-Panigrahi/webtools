// The command palette: jump to any tool by fuzzy name, run a shell command
// (type ">"), or paste a snippet and open it in the tool that fits.

import { h } from '../ui/dom.js';
import { icons, categoryIcons } from '../ui/icons.js';
import { highlightMatches } from '../ui/highlight.js';
import { rankTools, fuzzyMatch } from '../lib/fuzzy.js';
import { detectContent } from '../lib/detect.js';
import { elide } from '../lib/text.js';
import { recentIds } from './prefs.js';

const MIN_DETECT_LENGTH = 6;

/**
 * @param {Object} options
 * @param {Object[]} options.tools
 * @param {(id:string) => Object|undefined} options.findTool
 * @param {() => {title:string, keywords?:string, shortcut?:string, run:()=>void}[]} options.getCommands
 * @param {(id:string, text?:string) => void} options.openTool
 */
export function createPalette({ tools, findTool, getCommands, openTool }) {
  const input = h('input', {
    class: 'palette-input', placeholder: 'Search tools, paste a snippet, or type > for commands', spellcheck: 'false',
    role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'palette-list', 'aria-autocomplete': 'list',
  });
  const list = h('div', { class: 'palette-list', id: 'palette-list', role: 'listbox' });
  const footer = h('div', { class: 'palette-footer' },
    h('span', {}, h('kbd', {}, '↑'), h('kbd', {}, '↓'), ' move'),
    h('span', {}, h('kbd', {}, '↵'), ' open'),
    h('span', {}, h('kbd', {}, '>'), ' commands'),
    h('span', {}, h('kbd', {}, 'esc'), ' close'),
  );
  const dialog = h('div', { class: 'palette', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Command palette' },
    h('div', { class: 'palette-search' }, h('span', { class: 'palette-search-icon', html: icons.search }), input),
    list,
    footer,
  );
  const overlay = h('div', { class: 'overlay' }, dialog);

  let items = [];
  let selected = 0;
  // An <input> drops line breaks from a paste, which would turn a pasted CSV
  // into one line; detection and the hand-off use the original text instead.
  let pasted = '';

  const markSelected = () => {
    items.forEach((item, index) => item.element.classList.toggle('sel', index === selected));
    const current = items[selected];
    if (current) {
      input.setAttribute('aria-activedescendant', current.element.id);
      current.element.scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  };

  const select = (index) => {
    if (!items.length) return;
    selected = (index + items.length) % items.length;
    markSelected();
  };

  const close = () => overlay.classList.remove('open');
  const run = (item) => { close(); item.run(); };

  const addItem = (element, action) => {
    const index = items.length;
    element.id = `palette-item-${index}`;
    element.setAttribute('role', 'option');
    element.addEventListener('click', () => run(items[index]));
    element.addEventListener('mousemove', () => { if (selected !== index) select(index); });
    items.push({ element, run: action });
    list.append(element);
  };

  const section = (label) => list.append(h('div', { class: 'palette-section', role: 'presentation' }, label));

  const toolItem = (tool, nameIndices) => h('button', { class: 'palette-item', type: 'button' },
    h('span', { class: 'palette-icon', html: categoryIcons[tool.category] ?? '' }),
    h('span', { class: 'palette-text' },
      h('span', { class: 'palette-name' }, ...highlightMatches(tool.name, nameIndices)),
      h('span', { class: 'palette-desc' }, tool.desc),
    ),
    h('span', { class: 'palette-cat' }, tool.category),
  );

  const commandItem = (command, indices) => h('button', { class: 'palette-item', type: 'button' },
    h('span', { class: 'palette-icon', html: icons.command }),
    h('span', { class: 'palette-text' }, h('span', { class: 'palette-name' }, ...highlightMatches(command.title, indices))),
    command.shortcut ? h('kbd', { class: 'palette-kbd' }, command.shortcut) : null,
  );

  const listCommands = (query) => getCommands()
    .map((command) => ({ command, match: fuzzyMatch(query, `${command.title} ${command.keywords ?? ''}`) }))
    .filter(({ match }) => match)
    .sort((a, b) => b.match.score - a.match.score);

  function build() {
    list.replaceChildren();
    items = [];
    selected = 0;
    const raw = input.value;

    if (raw.startsWith('>')) {
      const matches = listCommands(raw.slice(1).trim());
      if (matches.length) section('Commands');
      matches.forEach(({ command, match }) => addItem(commandItem(command, match.indices.filter((index) => index < command.title.length)), command.run));
    } else {
      const content = pasted && pasted.replace(/\s/g, '') === raw.replace(/\s/g, '') ? pasted : raw;
      const detected = content.trim().length >= MIN_DETECT_LENGTH ? detectContent(content).filter(({ id }) => findTool(id)) : [];
      if (detected.length) {
        section(`Open “${elide(content)}” in`);
        detected.forEach(({ id, kind }) => {
          const element = toolItem(findTool(id), []);
          element.querySelector('.palette-desc').textContent = `Looks like ${kind}`;
          addItem(element, () => openTool(id, content));
        });
      }

      const query = raw.trim();
      if (!query) {
        const recent = recentIds().filter((id) => findTool(id));
        if (recent.length) {
          section('Recent');
          recent.forEach((id) => addItem(toolItem(findTool(id)), () => openTool(id)));
        }
        section('All tools');
        tools.filter((tool) => !recent.includes(tool.id)).forEach((tool) => addItem(toolItem(tool), () => openTool(tool.id)));
      } else {
        const ranked = rankTools(query, tools);
        if (ranked.length) section('Tools');
        ranked.forEach(({ tool, nameIndices }) => addItem(toolItem(tool, nameIndices), () => openTool(tool.id)));
        const commands = listCommands(query).filter(({ match }) => match.score >= 100);
        if (commands.length) section('Commands');
        commands.forEach(({ command, match }) => addItem(commandItem(command, match.indices.filter((index) => index < command.title.length)), command.run));
      }
    }

    if (!items.length) list.append(h('div', { class: 'palette-empty' }, raw.startsWith('>') ? 'No matching commands.' : 'No tools match. Try fewer letters, or > for commands.'));
    markSelected();
  }

  input.addEventListener('input', build);
  input.addEventListener('paste', (event) => { pasted = event.clipboardData.getData('text'); });
  input.addEventListener('keydown', (event) => {
    const moves = { ArrowDown: 1, ArrowUp: -1, PageDown: 5, PageUp: -5 };
    if (event.key in moves) { event.preventDefault(); select(selected + moves[event.key]); }
    else if (event.key === 'Enter') { event.preventDefault(); if (items[selected]) run(items[selected]); }
    else if (event.key === 'Tab') event.preventDefault();
  });
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });

  return {
    element: overlay,
    isOpen: () => overlay.classList.contains('open'),
    open(prefill = '') {
      pasted = '';
      input.value = prefill;
      overlay.classList.add('open');
      build();
      input.focus();
    },
    close,
  };
}
