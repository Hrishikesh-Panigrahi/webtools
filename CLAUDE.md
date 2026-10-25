# CLAUDE.md

Client-side dev-tools site. Vite + vanilla JS, no framework, no runtime deps. Build output is static files.

## Run

```
npm run dev       # localhost:5173, hot reload
npm run build     # -> dist/ (adds the Content-Security-Policy)
npm test          # node --test over test/ — pure-logic modules only
```

## Add a tool

A tool is an object in a `src/tools/*` module:

```js
{ id, category, name, title, desc, keywords?, sensitive?, mount(body) }
```

- `mount(body)` builds the UI into `body`. For input→output tools use `transformTool({ transform })` from `ui/panel.js`; for tools that read a binary file use `filePicker({ accept, onFile })`.
- Import the module's array in `src/registry.js`. Sidebar, home page, palette, routing and search follow automatically.
- `id` is the URL hash (`#json-compare`) — keep it unique. `keywords` feed the fuzzy search.
- `sensitive: true` keeps the tool's input in sessionStorage only (gone when the tab closes). Use it for tools whose input is usually a credential.
- A *new* `category` also needs an entry in `categoryIcons` (`ui/icons.js`), or its sidebar
  group shows a blank space where the glyph goes.
- A placeholder doubles as the "Example" button's sample, so make it a realistic input.

## Where things live

Four layers; each only imports from the ones above it.

```
lib/        pure logic, no DOM — imported straight into node --test
  json.js        parser with line/column errors + Repair, formatJson, paths
  detect.js      guess what a pasted snippet is (home page, palette)
  fuzzy.js       fuzzy matching and tool ranking
  diff.js        Myers line diff; text.js locate/countLines/elide
  security.js    escapeHtml, isSafeUrl, sanitizeStateValues, findSecret
  tokens.js      token estimation; models.js + prices.json the price table
  cron, qr, exif, imagefile, ip, units, useragent, format
ui/         reusable widgets
  dom.js         h() element builder, setField, onRunKey, shortcutLabel
  icons.js       inline SVG icons + categoryIcons
  buttons.js     copyButton, pasteButton, downloadButton, clearButton, exampleButton
  editor.js      codeEditor: line numbers, Ln/Col, wrap, Tab indent, error marker
  panel.js       transformTool, inputHeader, runOnInput, toggleRow, keyValueRow, filePicker
  notice.js      errorNotice (line/column, Go to error, Repair); diffView.js; toast.js; split.js
navigation.js  openTool(id, text) / takeHandOff — tools and shell both move between tools
tools/      one module per category
shell/      the app around the tools
  header, sidebar, palette, home, help, theme   the chrome
  toolView.js    renders a tool: header actions, state, hand-off, splitters, a11y names
  toolState.js   persistence + share-link state; storage.js never-throwing Web Storage
  router.js, prefs.js (pins, recents), pasteAndDrop.js
main.js     composes the shell and routes between views
```

## Gotchas

- Colors come from CSS vars in `styles/base.css` — don't hardcode, add/reuse a token.
- Prefer web APIs over deps: `crypto.subtle` (hashing), `crypto.randomUUID`, `URL`, `BigInt`, `Intl`, `DOMParser`.
- CSS is imported from JS (`import './styles/base.css'`) — that's a Vite thing, breaks without a bundler.
- Client-side only: no network calls at runtime, and the build's CSP (`vite.config.js`)
  enforces it. The one exception is `npm run prices`, a build-time script that
  regenerates `src/lib/prices.json`; the committed JSON is what ships.
- Anything user-typed reaches the DOM as text (`h()` children, `textContent`). Where a
  tool must build markup (markdown, regex highlight), escape with `escapeHtml` and check
  links with `isSafeUrl` from `lib/security.js`. Look tools up with `findTool` — ids come
  from the URL, and a plain object would answer `#__proto__`.
- State restore writes *every* saved control value first, then fires `input`/`change`
  on each in document order. So a `change` handler that rebuilds another control's
  options wipes that control's restored value, and one that seeds a text field
  overwrites restored content. Either populate a `<select>` with every option up
  front (see the unit converter's optgroups), or mark the control `data-no-persist`
  if it is really an action rather than state (see the QR template picker).
- `codeEditor` hooks the textarea's `.value` setter so the gutter follows programmatic
  output; keep assigning `.value` as usual. Anything that reads `scrollTop` or layout on
  every run forces a layout of the whole text — about a second per megabyte.
- Large input: use `runOnInput` (debounces past 50k chars), not a bare `input` listener.
  `transformTool` shows at most 300k chars of output; Copy/Download get all of it.
- `base.css` forces `[hidden] { display: none !important }`. Without it a class that
  sets `display` (`.io-box { display: flex }`) beats the user agent's `[hidden]` rule,
  so `element.hidden = true` leaves the panel on screen. Don't remove it, and don't
  add per-component `[hidden]` rules — the global one covers them.
- Build a regex for user input so it can't backtrack: `[^.!?]+[.!?]+` re-scans the
  whole string from every start position, which cost seconds on a 50k paste. Bound
  quantifiers (`{1,256}`) in anything scanned over whole inputs. And a pattern the
  *user* supplies can throw at `.exec()`, not just at `new RegExp` — V8 compiles
  lazily, so keep the scan inside the try too.
- The shell gives every control an accessible name after mount, borrowing the nearest
  visible `.io-label` / `.part-label`. So a field inside an `.io-box` or a labelled row
  needs nothing. A control in a bare `.tool-actions` row has no label to borrow — give
  that one an explicit `aria-label`.
- Anything `await`ed between a user action and a render needs a guard: take a ticket
  (`const request = ++latest`) and bail on resume if `request !== latest`. Dropping two
  files quickly into the image converter otherwise showed the first image's dimensions
  next to the second file's name and size.
- Before calling a change done: build passes *and* you opened the tool and used it.

## Conventions

See the skills: `clean-code`, `ui`, `review-checklist`.
