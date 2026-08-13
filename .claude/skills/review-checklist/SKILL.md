---
name: review-checklist
description: Review checklist for webTools changes — check code quality, tool conventions, UI consistency, accessibility, and that the project still builds, passes `npm test`, and every tool mounts. Includes the traps this repo has already shipped once. Invoke to review a diff before committing.
---

# Review checklist

Walk the diff against this list. Flag anything that fails; don't rubber-stamp.

## Builds, tests and runs
- `npm run build` passes with no errors.
- `npm test` passes. New pure logic under `src/` comes with tests in `test/`; a change to
  existing logic that no test would have caught means the test was missing, so add it.
- The dev server loads and the affected tool actually works — drive it, don't assume.
- Drive it with awkward input too, not just the happy path: empty, whitespace, unicode,
  a 50k-character paste, one long unbreakable token, and something malformed for that
  tool's format. Watch the console; an uncaught error is a failure.

## Tool conventions
- Every tool object has `id`, `category`, `name`, `title`, `desc`, and `mount`.
- `id` is unique (it doubles as the URL hash).
- A new tool's module array is imported in `src/registry.js`.
- Inputs use placeholders, not prefilled example values.

## Code quality (see the `clean-code` skill)
- Names are full and descriptive; functions are verbs, values are nouns.
- Comments are minimal and explain *why*, not *what*.
- Existing helpers (`transformTool`, `ioBox`, `filePicker`, `h`, `copyBtn`, `formatBytes`)
  are reused instead of reinvented.
- No dead code, leftover `console.log`, unused variables, or unused exports.

## UI (see the `ui` skill)
- Colors come from theme tokens; looks correct in both light and dark.
- Reuses existing components and spacing; nothing visually out of place.
- Layout holds up at mobile width *with content in it*, and a long unbreakable value
  neither widens the page nor squeezes a neighbouring field.
- Every control has an accessible name; icon-only buttons carry an `aria-label`.

## Traps this repo has already hit
Each of these shipped once. Check the diff for them.
- **Hiding**: use `element.hidden`. A component that sets `display` on a class beats the
  user agent's `[hidden]` rule, so a per-component `display` on a hidden panel re-shows it.
- **State restore**: the shell writes every saved control value, *then* fires
  `input`/`change` in document order. A `change` handler that rebuilds another control's
  options or seeds a text field destroys the restored value. Populate a `<select>` with
  every option up front, or mark a real action `data-no-persist`.
- **Async races**: anything `await`ed between a user action and a render needs a ticket
  (`const request = ++latest`) and must bail on resume if `request !== latest`.
- **Regexes over user input**: no nested/adjacent quantifiers that can backtrack over the
  whole string, and remember a user-supplied pattern can throw at `.exec()` rather than at
  `new RegExp`, because V8 compiles lazily — keep the scan inside the `try`.
- **Error messages**: report what went wrong in plain words. Don't surface a raw
  `JSON.parse` message, and don't echo the whole input back.

## Safety
- The tool is fully client-side — no network calls, nothing leaves the browser.
- Anything rendered through `innerHTML` escapes the user's input.
