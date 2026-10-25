// Moving between tools, shared by the tools themselves (a pipe sends its
// output onward) and by the shell (the palette, the home page).
//
// Text travelling with a navigation is held in memory rather than the URL, so
// a megabyte of JSON never lands in the address bar or the history list.

let pendingInput = null;

/** Navigate to tool `id`, optionally giving it `text` as its main input. */
export function openTool(id, text) {
  if (text != null) pendingInput = text;
  // Opening the tool already on screen changes no hash, so nothing would pick
  // up the text; announce the navigation explicitly instead.
  if (location.hash === `#${id}`) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = id;
}

/** Take the text handed to the tool being opened, if any; it is delivered once. */
export function takeHandOff() {
  const text = pendingInput;
  pendingInput = null;
  return text;
}
