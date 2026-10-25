// Web Storage access that never throws. Private windows, blocked site data and
// a full quota all make localStorage throw, and none of that should take the
// app down: a preference that cannot be saved is simply not saved.

export function readText(key, storage = localStorage) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function writeText(key, text, storage = localStorage) {
  try {
    storage.setItem(key, text);
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key, storage = localStorage) {
  try { storage.removeItem(key); } catch { /* storage blocked — nothing to remove */ }
}

/** The parsed JSON under `key`, or `fallback` when missing, blocked or corrupt. */
export function readJson(key, fallback, storage = localStorage) {
  const text = readText(key, storage);
  if (text == null) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

export const writeJson = (key, value, storage = localStorage) => writeText(key, JSON.stringify(value), storage);
