---
name: review-checklist
description: Review checklist for webTools changes — check code quality, tool conventions, UI consistency, and that the project still builds and every tool mounts. Invoke to review a diff before committing.
---

# Review checklist

Walk the diff against this list. Flag anything that fails; don't rubber-stamp.

## Builds and runs
- `npm run build` passes with no errors.
- The dev server loads and the affected tool actually works — drive it, don't assume.

## Tool conventions
- Every tool object has `id`, `category`, `name`, `title`, `desc`, and `mount`.
- `id` is unique (it doubles as the URL hash).
- A new tool's module array is imported in `src/registry.js`.
- Inputs use placeholders, not prefilled example values.

## Code quality (see the `clean-code` skill)
- Names are full and descriptive; functions are verbs, values are nouns.
- Comments are minimal and explain *why*, not *what*.
- Existing helpers (`transformTool`, `ioBox`, `h`, `copyBtn`) are reused instead of
  reinvented.
- No dead code, leftover `console.log`, or unused variables.

## UI (see the `ui` skill)
- Colors come from theme tokens; looks correct in both light and dark.
- Reuses existing components and spacing; nothing visually out of place.
- Layout holds up at mobile width.

## Safety
- The tool is fully client-side — no network calls, nothing leaves the browser.
