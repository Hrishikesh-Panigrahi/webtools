// Paste or drop anywhere: content goes where it obviously should, without
// first having to click into the right field.

import { setField, isEditable } from '../ui/dom.js';
import { toast } from '../ui/toast.js';
import { formatBytes } from '../lib/format.js';
import { primaryField } from './toolState.js';

// A text field can hold more, but past this the tab slows to a crawl and
// a binary file dropped by mistake is far more likely than real input.
const MAX_DROPPED_BYTES = 20 * 1024 * 1024;

/**
 * A paste with no field focused lands in the home page's detector, or in the
 * current tool's main input.
 * @param {() => ({ kind: 'home', paste(text: string): void } | { kind: 'tool', body: HTMLElement } | null)} getView
 * @param {() => boolean} isDialogOpen
 */
export function enablePasteAnywhere(getView, isDialogOpen) {
  document.addEventListener('paste', (event) => {
    if (isEditable(event.target) || isDialogOpen()) return;
    const text = event.clipboardData.getData('text');
    const view = getView();
    if (!text || !view) return;
    if (view.kind === 'home') {
      event.preventDefault();
      view.paste(text);
      return;
    }
    const field = primaryField(view.body);
    if (!field) return;
    event.preventDefault();
    setField(field, text);
    field.focus();
    toast('Pasted into the input');
  });
}

const carriesFiles = (event) => [...(event.dataTransfer?.types ?? [])].includes('Files');

/**
 * Drop a text file onto a particular editor to fill that one, or anywhere
 * else on a tool to fill its main input. File pickers handle their own drops.
 * @param {HTMLElement} area
 * @param {() => HTMLElement | null} getToolBody
 */
export function enableFileDrop(area, getToolBody) {
  area.addEventListener('dragover', (event) => {
    const body = getToolBody();
    if (!carriesFiles(event) || !body || !primaryField(body) || event.target.closest('.dropzone')) return;
    event.preventDefault();
    area.classList.add('is-dropping');
  });
  area.addEventListener('dragleave', (event) => {
    if (!area.contains(event.relatedTarget)) area.classList.remove('is-dropping');
  });
  area.addEventListener('drop', (event) => {
    area.classList.remove('is-dropping');
    const body = getToolBody();
    if (event.defaultPrevented || !body || !carriesFiles(event)) return;
    const target = event.target.closest('textarea:not([readonly])') ?? primaryField(body);
    const file = event.dataTransfer.files[0];
    if (!target || !file) return;
    event.preventDefault();
    if (file.size > MAX_DROPPED_BYTES) {
      toast(`${file.name} is ${formatBytes(file.size)} — files over ${formatBytes(MAX_DROPPED_BYTES)} aren't loaded`);
      return;
    }
    file.text().then((text) => {
      setField(target, text);
      // Button-driven tools compute on Ctrl+Enter — nudge them.
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
      toast(`Loaded ${file.name} · ${formatBytes(file.size)}`);
    });
  });
}
