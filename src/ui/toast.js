// A brief confirmation at the bottom of the screen. One at a time: a new
// toast replaces whatever is showing.

import { h } from './dom.js';

const VISIBLE_MS = 1800;
const VISIBLE_WITH_ACTION_MS = 5000;
const FADE_MS = 200;

let host = null;

/**
 * Show `message`, announced politely to screen readers.
 * @param {string} message
 * @param {{ label: string, run: () => void }} [action]  e.g. an Undo button
 */
export function toast(message, action) {
  host ??= document.body.appendChild(h('div', { class: 'toast-host', role: 'status', 'aria-live': 'polite' }));
  const note = h('div', { class: 'toast' }, h('span', {}, message));
  const dismiss = () => {
    note.classList.remove('show');
    setTimeout(() => note.remove(), FADE_MS);
  };
  if (action) {
    note.append(h('button', { class: 'toast-action', type: 'button', onClick: () => { action.run(); dismiss(); } }, action.label));
  }
  host.replaceChildren(note);
  requestAnimationFrame(() => note.classList.add('show'));
  setTimeout(dismiss, action ? VISIBLE_WITH_ACTION_MS : VISIBLE_MS);
}
