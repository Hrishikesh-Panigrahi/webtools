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
- Keep type sizes within the existing scale.

## Shape and state tokens
Use these rather than inventing values, or the surface stops matching itself.
- Radius: `--radius-sm` (6px) for chips and small icon buttons, `--radius` (8px) for
  buttons, fields and selects, `--radius-lg` (11px) for cards and panes — textareas,
  stat tiles, `.kv-list`, previews, the diff and JSON panes.
- Focus: `--ring`, always with `border-color: var(--accent)`. `base.css` already applies
  it to every control on `:focus-visible`; add a `:focus` rule only where the element
  should also ring on mouse focus, as text fields do.
- Depth: `--shadow-sm` for a resting button, `--shadow-pop` for a primary button's hover.
  Nothing else should cast a shadow.
- Hierarchy: primary action is `.btn.btn-primary`, secondary is a plain `.btn`, and a
  tertiary or destructive-adjacent one is `.btn-ghost`. Copy and icon buttons stay
  borderless until hover so they don't compete with the real actions.

## Theming (required)
- Never hardcode a color. Use the CSS variables in `styles/base.css`
  (`--bg`, `--surface`, `--surface-2`, `--border`, `--text`, `--text-dim`, `--accent`, …).
  Widget styles live in `styles/components.css`.
- Every change must look right in both light and dark. Both themes are defined via
  `:root` and `:root[data-theme="dark"]` — add tokens there, not inline colors.
- The exception is a color that *is* the content — QR modules, gradient stops, the white
  matte behind a JPEG. Those must be real colors and must not follow the theme.

## Structure
- Build DOM with the `h` helper from `dom.js`; don't hand-write `innerHTML` for structure.
- Reuse existing classes and components before inventing new ones: `io-box`, `io-textarea`,
  `btn` / `btn-primary` / `btn-ghost`, `part-input`, `param-row`, `color-out-row`, `stat`,
  `dropzone`, `kv-list`.
- Use `panel.js` layouts for standard shapes: `transformTool` and `ioBox` for input→output,
  `filePicker` for tools that read a binary file.

## Hiding things
- `base.css` forces `[hidden] { display: none !important }`, because a class that sets
  `display` (`.io-box { display: flex }`) otherwise beats the user agent's rule and the
  "hidden" panel stays on screen. Use `element.hidden`; don't add per-component
  `[hidden]` rules, and don't remove the global one.

## Inputs
- Use placeholders to hint format — never prefill real example values into a field.
- Keep visible focus states intact.
- Accessible names come for free: after mount the shell gives each control the nearest
  visible `.io-label` / `.part-label`. A control in a bare `.tool-actions` row has no
  label to borrow — give that one an explicit `aria-label`. Icon-only buttons always need
  one, since they have no text to fall back on.

## Content you don't control
- Assume any value on screen may be one long unbreakable run. Grid children need
  `min-width: 0` or a single long token grows its column and starves the other one;
  panes that show raw content scroll with `overflow: auto`; prose and error text wrap
  with `overflow-wrap: anywhere`.
- Don't echo a whole input back in a message — elide past ~32 characters.

## Responsive
- Everything must work down to a narrow phone width. Grids collapse to one column; the
  sidebar becomes a drawer. Test the layout at ~360px before finishing.
- Check with content in it, not empty: fixed label columns that look fine blank will
  clip a real value.
