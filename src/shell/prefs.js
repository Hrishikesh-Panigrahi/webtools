// Pinned and recently used tools, remembered in localStorage. Anything that
// shows them subscribes, so pinning from the palette updates the sidebar too.

import { readJson, writeJson } from './storage.js';

const PINNED_KEY = 'webtools-pinned';
const RECENT_KEY = 'webtools-recent';
const MAX_RECENT = 6;

const readIds = (key) => {
  const ids = readJson(key, []);
  return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : [];
};

const listeners = new Set();
const notify = (kind) => listeners.forEach((listener) => listener(kind));

/** Call `listener('pinned' | 'recent')` whenever either list changes; returns an unsubscribe. */
export function onPrefsChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const pinnedIds = () => readIds(PINNED_KEY);
export const isPinned = (id) => pinnedIds().includes(id);

/** Pin or unpin `id`; returns whether it is now pinned. */
export function togglePinned(id) {
  const pinned = pinnedIds();
  const isNowPinned = !pinned.includes(id);
  writeJson(PINNED_KEY, isNowPinned ? [...pinned, id] : pinned.filter((pinnedId) => pinnedId !== id));
  notify('pinned');
  return isNowPinned;
}

export const recentIds = () => readIds(RECENT_KEY);

export function recordVisit(id) {
  const recent = recentIds();
  if (recent[0] === id) return;
  writeJson(RECENT_KEY, [id, ...recent.filter((recentId) => recentId !== id)].slice(0, MAX_RECENT));
  notify('recent');
}
