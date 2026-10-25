// Light and dark themes. The choice is remembered; until one is made, the
// operating system's preference decides.

import { h } from '../ui/dom.js';
import { icons } from '../ui/icons.js';
import { readText, writeText } from './storage.js';

const THEME_KEY = 'webtools-theme';
const listeners = new Set();

export const currentTheme = () => document.documentElement.getAttribute('data-theme');

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  writeText(THEME_KEY, theme);
  listeners.forEach((listener) => listener(theme));
}

export function initTheme() {
  const saved = readText(THEME_KEY);
  const preferred = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  applyTheme(saved === 'dark' || saved === 'light' ? saved : preferred);
}

export const toggleTheme = () => applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');

/** A header button that toggles the theme and shows the one it would switch to. */
export function themeButton() {
  const button = h('button', { class: 'btn-icon', type: 'button', 'aria-label': 'Toggle theme', title: 'Toggle theme', onClick: toggleTheme });
  const paint = () => { button.innerHTML = currentTheme() === 'dark' ? icons.sun : icons.moon; };
  listeners.add(paint);
  paint();
  return button;
}
