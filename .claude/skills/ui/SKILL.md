---
name: ui
description: UI and styling guidelines for webTools — keep the interface minimal, subtle, consistent, theme-aware and responsive. Invoke before adding or changing any HTML/CSS or building a new tool's UI.
---

# UI guidelines

The look is minimal and calm. Restraint over decoration. New UI should be
indistinguishable in style from what already exists.

## Look and feel
- Subtle, not flashy. Avoid heavy shadows, glows, and strong gradients. Communicate state
  with a border-color or background change, not a colored halo.
- Consistent spacing — small, even gaps. When unsure, match the spacing of a nearby element.
- Round corners with `var(--radius)`. Keep type sizes within the existing scale.

## Theming (required)
- Never hardcode a color. Use the CSS variables in `style.css`
  (`--bg`, `--surface`, `--surface-2`, `--border`, `--text`, `--text-dim`, `--accent`, …).
- Every change must look right in both light and dark. Both themes are defined via
  `:root` and `:root[data-theme="dark"]` — add tokens there, not inline colors.

## Structure
- Build DOM with the `h` helper from `dom.js`; don't hand-write `innerHTML` for structure.
- Reuse existing classes and components before inventing new ones: `io-box`, `io-textarea`,
  `btn` / `btn-primary` / `btn-ghost`, `part-input`, `param-row`, `color-out-row`, `stat`.
- Use `panel.js` layouts (`transformTool`, `ioBox`) for standard input/output tools.

## Inputs
- Use placeholders to hint format — never prefill real example values into a field.
- Give icon-only buttons an `aria-label`; keep visible focus states intact.

## Responsive
- Everything must work down to a narrow phone width. Grids collapse to one column; the
  sidebar becomes a drawer. Test the layout at ~360px before finishing.
