// The keyboard shortcut sheet, opened with "?".

import { h, shortcutLabel } from '../ui/dom.js';

const SHORTCUTS = [
  [shortcutLabel('K'), 'Search tools, paste a snippet, or type > for commands'],
  ['/', 'Filter the sidebar; ↑ ↓ to move, ↵ to open'],
  [shortcutLabel('V'), 'Paste anywhere: into the tool\'s input, or onto the home page to find a tool'],
  [shortcutLabel('↵'), 'Run the current tool now, or open the suggested tool from home'],
  ['Tab / ⇧Tab', 'Indent or outdent lines in an editor'],
  ['Esc, then Tab', 'Leave an editor with the keyboard'],
  ['?', 'Show this help'],
  ['Esc', 'Close a dialog'],
];

export function createHelpDialog() {
  const element = h('div', { class: 'overlay' },
    h('div', { class: 'help', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Keyboard shortcuts' },
      h('h2', { class: 'help-title' }, 'Keyboard shortcuts'),
      ...SHORTCUTS.map(([keys, description]) => h('div', { class: 'help-row' },
        h('kbd', { class: 'help-keys' }, keys), h('span', {}, description))),
      h('p', { class: 'help-note' },
        'Drop a text file anywhere on a tool to load it. Inputs are saved in this browser as you type — '
        + 'except tokens, keys and other credentials, which are kept only until you close the tab. '
        + 'Nothing you enter ever leaves your browser.'),
    ),
  );
  const close = () => element.classList.remove('open');
  element.addEventListener('click', (event) => { if (event.target === element) close(); });
  return { element, open: () => element.classList.add('open'), close };
}
