# CLAUDE.md

**webTools** — 100% client-side developer utilities. **Vite 8 + vanilla JS**; no framework, no
runtime dependencies. The built `dist/` is pure static files.

```bash
npm run dev       # dev server + hot reload at http://localhost:5173
npm run build     # production build -> dist/   (must pass before committing)
npm run preview   # serve the production build
```

## The one pattern that matters: the tool registry

Every tool is a plain object `{ id, category, name, title, desc, mount(body) }` living in a
`src/tools/*` module, collected in `src/registry.js`. **Adding a tool = write the object + import
its array in `registry.js`.** Sidebar, hash routing, search, copy buttons, and theming are all
derived automatically — no other file changes.

- `id` doubles as the URL hash (`#json-compare`) and must be unique.
- Sidebar order follows the spread order in `registry.js`; tools appear in their array order.

## Helpers — use these, don't hand-roll DOM

`src/dom.js`
- `h(tag, attrs, ...kids)` — element builder. Special attrs: `class`; `html` (→ innerHTML);
  `value` (set as a **property**, not attribute); `onClick`/`onInput`/… (→ event listeners);
  `attr: true` → bare attribute. Nullish/false children and attrs are skipped; children flatten.
- `copyBtn(getText)` — a Copy button wired to `getText()`.
- `onRunKey(el, fn)` — runs `fn` on ⌘/Ctrl+Enter.

`src/panel.js`
- `transformTool({ transform, live, actionLabel, placeholder, inputLabel, outputLabel })` — the
  standard input→output shell. `transform(text)` returns a string, or **throws `Error(msg)`** to
  render `msg` in the error box. `live: true` runs on every keystroke with no button.
- `ioBox(label, node, { copy })` — a labelled box wrapper.

Custom tools (URL parser, color, JSON diff, timestamp, number base) build their own `mount` with `h()`.

## Platform-first — why there are no libraries

Reach for built-ins; do not add dependencies for these:
- Hashing → `crypto.subtle.digest` (**async**); UUID → `crypto.randomUUID()`.
- URLs → `URL` / `URLSearchParams`; relative dates → `Intl.RelativeTimeFormat`.
- Arbitrary-precision integers (number-base tool) → `BigInt`; HTML unescape → `DOMParser`.
- JSON Compare is an LCS line-diff over both docs normalized with `sortDeep` + pretty-print, so
  key order never registers as a difference.

## Styling

- All colors are CSS custom properties defined in `styles/base.css` (`:root` and
  `:root[data-theme="dark"]`). **Never hardcode a color** — add or reuse a token.
- `base.css` = tokens + app shell; `components.css` = tool widgets. Both are imported from
  `main.js` (`import './styles/base.css'`). That JS-imports-CSS is a **Vite feature, not native** —
  going build-less would break it and require `<link>` tags instead.
- Persisted UI state (localStorage): `webtools-theme`, `webtools-collapsed` (collapsed nav
  groups), `webtools-sidebar` (desktop sidebar collapse).

## Invariants

- **Client-side only** — no network calls; nothing a user types may leave the browser.
- **No runtime dependencies** — Vite stays the only entry in `package.json`.
- **Hash routing** (`#tool-id`) so the site hosts on any static server with no config.
- Inputs use **placeholders, never prefilled example values**.

## Conventions (project skills — follow, don't restate)

`clean-code` (modular, readable, few comments) · `ui` (minimal, token-driven, responsive) ·
`review-checklist` (run before committing).

## Verifying a change

`npm run build` must pass **and** the affected tool must work when driven in the dev server — open
it, exercise it, don't infer from the code. Check both light/dark themes and a ~360px width.

## Git

Plain, factual commit messages. Branch off `main`; commit and push only when asked.
