# CLAUDE.md

Guidance for working in this repo. Keep this file short and current — it loads into every session.

## What this is

**webTools** — a collection of fast, 100% client-side developer utilities (JSON, URL, encoding,
text, color, crypto, ciphers). Built with **Vite 8 + vanilla JavaScript**. No framework, no
backend, no tracking, and **no runtime dependencies** — the built `dist/` is pure static files.

## Commands

```bash
npm install       # install dev tooling (Vite only)
npm run dev       # dev server + hot reload at http://localhost:5173
npm run build     # production build -> dist/
npm run preview   # serve the production build locally
```

## Architecture

```
index.html          Entry point; loads /src/main.js as a module
src/
  main.js           App shell — sidebar, search, hash routing, theme toggle, sidebar collapse
  registry.js       Single source of truth: imports every tool module, groups by category
  dom.js            DOM helpers — h(), copyBtn(), onRunKey(), icons
  panel.js          Reusable layouts — transformTool(), ioBox()
  styles/
    base.css        Theme tokens (:root / [data-theme]), reset, header, sidebar, layout
    components.css  Tool widgets — panels, buttons, fields, diff view, etc.
  tools/            One module per category; each exports an array of tool objects
```

**Tool registry pattern.** Every tool is a plain object:

```js
{ id, category, name, title, desc, mount(body) }
```

`mount(body)` builds the tool's UI into the given element. To add a tool: write/extend a module
in `src/tools/`, then import its array in `src/registry.js` — nothing else. The sidebar, routing,
search, copy buttons, and theming are all automatic. Use `transformTool()` for the common
input→output shape (see README for a full example).

**Routing** is hash-based (`#tool-id`) so the site works on any static host with no server config.
**Theming** is CSS variables switched by a `data-theme` attribute on `<html>`, persisted to
`localStorage`. Never hardcode a color — use the tokens in `base.css`.

## Conventions

Three project skills define the standards — follow them, don't restate them:

- **`clean-code`** — modular, readable, self-documenting JS; descriptive names; minimal comments.
- **`ui`** — minimal/subtle styling, theme tokens only, reuse existing components, responsive.
- **`review-checklist`** — run before committing any change.

Quick reminders: reuse the helpers (`h`, `copyBtn`, `transformTool`, `ioBox`) before writing new
code; use placeholders, never prefilled example values, in inputs.

## Constraints

- **Client-side only.** No network calls — nothing a user types may leave the browser.
- **No runtime dependencies.** Keep Vite the only dependency; don't add libraries for things the
  platform already does (Web Crypto, `crypto.randomUUID`, `URL`, `Intl`, etc.).

## Verifying a change

`npm run build` must pass, and the affected tool must actually work when driven in the dev server —
open it, exercise it, don't assume. Check both light and dark themes and a narrow (mobile) width.

## Git

- Commit messages are **plain and factual**. Do **not** add any AI/Claude/`Co-Authored-By`
  attribution — commits are authored solely by the repo owner.
- Branch off `main` for non-trivial work; commit and push only when asked.
