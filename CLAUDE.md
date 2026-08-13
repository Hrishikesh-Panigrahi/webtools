# CLAUDE.md

Client-side dev-tools site. Vite + vanilla JS, no framework, no runtime deps. Build output is static files.

## Run

```
npm run dev       # localhost:5173, hot reload
npm run build     # -> dist/
npm test          # node --test over test/ — pure-logic modules only
```

## Add a tool

A tool is an object in a `src/tools/*` module:

```js
{ id, category, name, title, desc, mount(body) }
```

- `mount(body)` builds the UI into `body`. For input→output tools use `transformTool({ transform })` from `panel.js`; for tools that read a binary file use `filePicker({ accept, onFile })`.
- Import the module's array in `src/registry.js`. Sidebar, routing, search and theme follow automatically.
- `id` is the URL hash (`#json-compare`) — keep it unique.

## Where things live

```
main.js        shell: sidebar, hash routing, theme toggle
registry.js    the tool list
dom.js         h() element builder, copyBtn, clearField, onRunKey
panel.js       transformTool, ioBox, diffView, toggleRow, keyValueRow, filePicker
state.js       tool state encoding (persistence + share links)
diff.js        line diff; tokens.js token estimation; cron.js cron schedules
qr.js          QR encoding (ISO/IEC 18004) + SVG/canvas rendering
exif.js        TIFF/EXIF tags; imagefile.js JPEG/PNG/WebP containers + strip
ip.js          IPv4/IPv6 subnet maths; units.js unit tables; useragent.js UA parsing
format.js      formatBytes / formatDelta
prices.json    generated model price table (npm run prices) — don't hand-edit
styles/        base.css (tokens + shell), components.css (widgets)
tools/         one module per category
```

Pure logic lives in its own module at `src/` root, not inside a tool — those
modules have no DOM dependency, so `test/*.test.js` imports them directly. Add
tests there for new logic; tool `mount` functions are checked by hand in the browser.

## Gotchas

- Colors come from CSS vars in `styles/base.css` — don't hardcode, add/reuse a token.
- Prefer web APIs over deps: `crypto.subtle` (hashing), `crypto.randomUUID`, `URL`, `BigInt`, `Intl`, `DOMParser`.
- CSS is imported from JS (`import './styles/base.css'`) — that's a Vite thing, breaks without a bundler.
- Client-side only: no network calls at runtime. The one exception is
  `npm run prices`, a build-time script that regenerates `src/prices.json`; it is
  not part of `npm run build`, and the committed JSON is what ships.
- State restore writes *every* saved control value first, then fires `input`/`change`
  on each in document order. So a `change` handler that rebuilds another control's
  options wipes that control's restored value, and one that seeds a text field
  overwrites restored content. Either populate a `<select>` with every option up
  front (see the unit converter's optgroups), or mark the control `data-no-persist`
  if it is really an action rather than state (see the QR template picker).
- `base.css` forces `[hidden] { display: none !important }`. Without it a class that
  sets `display` (`.io-box { display: flex }`) beats the user agent's `[hidden]` rule,
  so `element.hidden = true` leaves the panel on screen. Don't remove it, and don't
  add per-component `[hidden]` rules — the global one covers them.
- Build a regex for user input so it can't backtrack: `[^.!?]+[.!?]+` re-scans the
  whole string from every start position, which cost seconds on a 50k paste. And a
  pattern the *user* supplies can throw at `.exec()`, not just at `new RegExp` —
  V8 compiles lazily, so keep the scan inside the try too.
- Before calling a change done: build passes *and* you opened the tool and used it.

## Conventions

See the skills: `clean-code`, `ui`, `review-checklist`.
