// Tiny DOM helpers — no framework, just ergonomics.

/**
 * Create an element, hyperscript-style.
 * @param {string} tag
 * @param {Object} [attrs]  class, html (trusted constant markup only), value,
 *   on<Event> handlers, or plain attributes; null/false skips an attribute
 * @param {...(Node|string|Array)} children  strings become text nodes, never markup
 */
export function h(tag, attrs = {}, ...children) {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (name === 'class') element.className = value;
    else if (name === 'html') element.innerHTML = value;
    else if (name === 'value') element.value = value;
    else if (name.startsWith('on') && typeof value === 'function') {
      element.addEventListener(name.slice(2).toLowerCase(), value);
    } else if (value === true) element.setAttribute(name, '');
    else element.setAttribute(name, value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    element.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return element;
}

/**
 * Set a field the way typing would, so live tools re-run and the shell's
 * saved-input state follows. Assigning `.value` alone fires no event, which
 * left the old text in localStorage and brought it back on the next visit.
 */
export function setField(field, text) {
  field.value = text;
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

export const clearField = (field) => setField(field, '');

/** Run `run` when Cmd/Ctrl+Enter is pressed inside `element`. */
export function onRunKey(element, run) {
  element.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      run();
    }
  });
}

const isMacKeyboard = /Mac|iPhone|iPad/.test(navigator.userAgent);

/** A Cmd/Ctrl chord as this platform writes it: "⌘K" or "Ctrl K". */
export const shortcutLabel = (key) => (isMacKeyboard ? `⌘${key}` : `Ctrl ${key}`);

/** Whether `target` is somewhere the user types, where global shortcuts must not fire. */
export const isEditable = (target) => target instanceof Element && !!target.closest('input, textarea, select, [contenteditable]');
