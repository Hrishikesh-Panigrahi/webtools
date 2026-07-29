# CLAUDE.md

Client-side dev-tools site. Vite + vanilla JS, no framework, no runtime deps. Build output is static files.

## Run

```
npm run dev       # localhost:5173, hot reload
npm run build     # -> dist/
```

## Add a tool

A tool is an object in a `src/tools/*` module:

```js
{ id, category, name, title, desc, mount(body) }
```

- `mount(body)` builds the UI into `body`. For input→output tools use `transformTool({ transform })` from `panel.js`.
- Import the module's array in `src/registry.js`. Sidebar, routing, search and theme follow automatically.
- `id` is the URL hash (`#json-compare`) — keep it unique.

## Where things live

```
main.js        shell: sidebar, hash routing, theme toggle
registry.js    the tool list
dom.js         h() element builder, copyBtn, clearField, onRunKey
panel.js       transformTool, ioBox, diffView, toggleRow, keyValueRow
state.js       tool state encoding (persistence + share links)
diff.js        line diff; tokens.js token estimation; cron.js cron schedules
prices.json    generated model price table (npm run prices) — don't hand-edit
styles/        base.css (tokens + shell), components.css (widgets)
tools/         one module per category
```

Pure logic lives in its own module at `src/` root, not inside a tool.

## Gotchas

- Colors come from CSS vars in `styles/base.css` — don't hardcode, add/reuse a token.
- Prefer web APIs over deps: `crypto.subtle` (hashing), `crypto.randomUUID`, `URL`, `BigInt`, `Intl`, `DOMParser`.
- CSS is imported from JS (`import './styles/base.css'`) — that's a Vite thing, breaks without a bundler.
- Client-side only: no network calls at runtime. The one exception is
  `npm run prices`, a build-time script that regenerates `src/prices.json`; it is
  not part of `npm run build`, and the committed JSON is what ships.
- Before calling a change done: build passes *and* you opened the tool and used it.

## Conventions

See the skills: `clean-code`, `ui`, `review-checklist`.
