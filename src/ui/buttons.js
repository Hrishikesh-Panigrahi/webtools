// The small, borderless action buttons that sit in a pane's label row:
// Copy, Paste, Download, Clear, Example.

import { h, setField, clearField } from './dom.js';
import { icons } from './icons.js';

const COPIED_FEEDBACK_MS = 1200;

const content = (iconHtml, label) => `${iconHtml}<span class="btn-label">${label}</span>`;

/**
 * A small borderless button: an icon and a word. In a narrow pane the word
 * hides and only the icon shows, so the word is also the tooltip.
 * `label` must be constant text — it is set as markup next to the icon.
 */
export const actionButton = (iconHtml, label, attrs = {}) =>
  h('button', { class: 'btn-copy', type: 'button', title: label, html: content(iconHtml, label), ...attrs });

/** Put `text` on the clipboard, falling back to a hidden textarea in insecure contexts. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const fallbackField = h('textarea', { value: text });
    document.body.append(fallbackField);
    fallbackField.select();
    document.execCommand('copy');
    fallbackField.remove();
  }
}

/** A "Copy" button for the string `getText()` returns; it says "Copied" briefly once done. */
export function copyButton(getText) {
  const button = actionButton(icons.copy, 'Copy');
  let resetTimer = 0;
  button.addEventListener('click', async () => {
    const text = getText();
    if (!text) return;
    await copyText(text);
    button.innerHTML = content(icons.check, 'Copied');
    button.classList.add('copied');
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      button.innerHTML = content(icons.copy, 'Copy');
      button.classList.remove('copied');
    }, COPIED_FEEDBACK_MS);
  });
  return button;
}

/** A "Paste" button that reads the clipboard and hands the text to `onText`. */
export function pasteButton(onText) {
  const button = actionButton(icons.paste, 'Paste', { title: 'Paste from clipboard' });
  button.addEventListener('click', async () => {
    let text;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      return; // clipboard read blocked (insecure context / denied) — nothing to do
    }
    if (text) onText(text);
  });
  return button;
}

/** A "Download" button that saves `getText()` as a plain-text file named `getName()`. */
export function downloadButton(getName, getText) {
  const button = actionButton(icons.download, 'Download', { title: 'Download output' });
  button.addEventListener('click', () => {
    const text = getText();
    if (!text) return;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const link = h('a', { href: url, download: getName() });
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  });
  return button;
}

/** A "Clear" button that empties `field` and puts the caret back in it. */
export function clearButton(field) {
  return actionButton(icons.trash, 'Clear', {
    title: 'Clear the input',
    onClick: () => { clearField(field); field.focus(); },
  });
}

/**
 * An "Example" button that loads the field's `data-sample`, so a first-time
 * visitor can see the tool work without hunting for test data. Placeholders
 * stay short hints: a realistic sample greyed out in an empty field reads as
 * input that somehow produced no output.
 * The caret goes to the start, so a long one-line example reads from its beginning.
 */
export function exampleButton(field) {
  return actionButton(icons.sample, 'Example', {
    title: 'Load an example',
    onClick: () => {
      setField(field, field.dataset.sample);
      field.focus();
      field.setSelectionRange?.(0, 0);
      field.scrollLeft = 0;
    },
  });
}
