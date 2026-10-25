// The top bar: menu, logo, the palette trigger, help and theme.

import { h, shortcutLabel } from '../ui/dom.js';
import { icons } from '../ui/icons.js';
import { themeButton } from './theme.js';

/**
 * @param {Object} actions
 * @param {() => void} actions.onToggleSidebar
 * @param {() => void} actions.onOpenPalette
 * @param {() => void} actions.onOpenHelp
 */
export function createHeader({ onToggleSidebar, onOpenPalette, onOpenHelp }) {
  const iconButton = (iconHtml, label, onClick, extraClass = '') => h('button', {
    class: `btn-icon ${extraClass}`.trim(), type: 'button', 'aria-label': label, title: label, html: iconHtml, onClick,
  });

  return h('header', { class: 'header' },
    h('div', { class: 'header-left' },
      iconButton(icons.menu, 'Toggle the tool list', onToggleSidebar, 'menu-toggle'),
      h('a', { class: 'logo', href: '#', title: 'All tools' },
        h('span', { class: 'logo-mark', html: icons.logo }),
        h('span', { class: 'logo-text' }, 'webTools'),
      ),
    ),
    // The palette is the search people look for, so it gets a visible trigger.
    h('button', { class: 'palette-trigger', type: 'button', 'aria-label': 'Search tools or paste a snippet', onClick: onOpenPalette },
      h('span', { class: 'palette-trigger-icon', html: icons.search }),
      h('span', { class: 'palette-trigger-label' }, 'Search tools or paste a snippet'),
      h('kbd', { class: 'palette-trigger-key' }, shortcutLabel('K')),
    ),
    h('div', { class: 'header-right' },
      // On a phone the wide trigger is hidden, so a plain icon stands in for it.
      iconButton(icons.search, 'Search tools', onOpenPalette, 'palette-mobile'),
      h('button', { class: 'btn-icon', type: 'button', 'aria-label': 'Keyboard shortcuts', title: 'Keyboard shortcuts (?)', onClick: onOpenHelp }, '?'),
      themeButton(),
    ),
  );
}
