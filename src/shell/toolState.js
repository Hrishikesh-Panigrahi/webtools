// What a tool's controls hold: saved as you type, restored on return, and
// carried by share links.
//
// State is a positional array of control values — strings for text, number
// and range inputs and selects, booleans for checkboxes — in document order of
// a tool's editable controls.

import { sanitizeStateValues, findSecret } from '../lib/security.js';
import { readJson, writeJson, removeKey } from './storage.js';

const STATE_PREFIX = 'webtools-input:';
const SAVE_DELAY_MS = 250;
// Browsers give a site about 5 MB of storage in all. One huge paste must not
// use it up and silently stop every other tool from remembering its input.
const MAX_SAVED_CHARS = 1_000_000;

/** Build the `s=…` query that carries `values` in a tool URL. */
export const encodeState = (values) => 's=' + encodeURIComponent(JSON.stringify(values));

/** The values carried by a hash query (the part after `?`), or null if absent or unsafe. */
export function decodeState(query) {
  const match = /(?:^|&)s=([^&]*)/.exec(query || '');
  if (!match) return null;
  try {
    return sanitizeStateValues(JSON.parse(decodeURIComponent(match[1])));
  } catch {
    return null;
  }
}

const NON_STATE_INPUT_TYPES = new Set(['button', 'submit', 'reset', 'file', 'color', 'image']);

/**
 * The controls whose values define a tool's state. Outputs (read-only) and
 * fields a tool rebuilds from another control (`data-no-persist`) are skipped.
 */
export function editableControls(body) {
  return [...body.querySelectorAll('input, textarea, select')].filter((control) => {
    if (control.matches('[data-no-persist]') || control.readOnly) return false;
    return control.tagName !== 'INPUT' || !NON_STATE_INPUT_TYPES.has((control.type || 'text').toLowerCase());
  });
}

const readControl = (control) => (control.type === 'checkbox' ? control.checked : control.value);

// A select only takes a value it actually offers. Anything else — a stale or
// hand-edited link — would blank it, and tools look options up by value.
function writeControl(control, value) {
  if (control.type === 'checkbox') control.checked = value === true;
  else if (control.tagName !== 'SELECT') control.value = typeof value === 'string' ? value : '';
  else if ([...control.options].some((option) => option.value === value)) control.value = value;
}

export const serializeControls = (body) => editableControls(body).map(readControl);

/**
 * Write `values` into the controls, then nudge each tool's own listeners so
 * its output recomputes. Returns false (and changes nothing) when the values
 * don't fit this tool's controls.
 */
export function applyState(body, values) {
  const controls = editableControls(body);
  if (!Array.isArray(values) || values.length !== controls.length) return false;
  controls.forEach((control, index) => writeControl(control, values[index]));
  controls.forEach((control) => {
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
  });
  // Button-driven tools compute on Ctrl+Enter — trigger it once on the first field.
  controls[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
  return true;
}

// Credentials live only as long as the tab: sessionStorage survives a reload
// but not closing the tab, so a pasted token never lingers on disk.
const holdsSecret = (tool, values) => tool.sensitive || values.some((value) => typeof value === 'string' && findSecret(value));

/** Restore a tool from its share-link state, else from this tab's or this browser's saved state. */
export function restoreState(body, tool, query) {
  const shared = decodeState(query);
  if (shared && applyState(body, shared)) return;
  for (const storage of [sessionStorage, localStorage]) {
    const saved = sanitizeStateValues(readJson(STATE_PREFIX + tool.id, null, storage));
    if (saved && applyState(body, saved)) return;
  }
}

/**
 * Save the tool's state as it changes, a moment after typing pauses.
 * @returns {() => void}  saves anything pending and stops; call it when leaving the tool
 */
export function bindStateSaving(body, tool) {
  const key = STATE_PREFIX + tool.id;
  let timer = 0;
  const save = () => {
    clearTimeout(timer);
    timer = 0;
    const values = serializeControls(body);
    const [keep, drop] = holdsSecret(tool, values) ? [sessionStorage, localStorage] : [localStorage, sessionStorage];
    removeKey(key, drop);
    const size = values.reduce((total, value) => total + (typeof value === 'string' ? value.length : 1), 0);
    // Too big to keep, or over quota anyway: the input just isn't remembered,
    // and an older, smaller save must not come back in its place.
    if (size > MAX_SAVED_CHARS || !writeJson(key, values, keep)) removeKey(key, keep);
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(save, SAVE_DELAY_MS);
  };
  const flush = () => { if (timer) save(); };
  body.addEventListener('input', schedule);
  body.addEventListener('change', schedule);
  addEventListener('pagehide', flush);
  return () => {
    flush();
    removeEventListener('pagehide', flush);
  };
}

export function clearSavedState(tool) {
  removeKey(STATE_PREFIX + tool.id, localStorage);
  removeKey(STATE_PREFIX + tool.id, sessionStorage);
}

/** The field a paste, a drop or a hand-off from another tool should land in. */
export function primaryField(body) {
  return body.querySelector('textarea:not([readonly])')
    ?? editableControls(body).find((control) => control.tagName === 'INPUT' && ['text', 'url', 'search'].includes(control.type));
}
