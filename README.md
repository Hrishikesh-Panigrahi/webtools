# webTools

A collection of fast, **100% client-side** developer utilities. Everything runs in your
browser — nothing you type is ever sent anywhere.

Built with plain JavaScript and [Vite](https://vitejs.dev/) — no runtime framework, no
backend, no tracking.

## Tools

| Category | Tools |
|----------|-------|
| **JSON** | Prettify (collapsible tree, full-width for large docs) · Minify · Validate · Sort Keys · Compare (git-style diff) |
| **URL**  | Editable Parser — edit any part or query param and the URL rebuilds live |
| **Encode** | Base64 · URL · HTML escape/unescape · JWT decode |
| **Text** | Case Converter · Regex Tester · Text Diff · Slugify · Word Counter · Markdown Preview · Lorem Ipsum |
| **Convert** | Unix Timestamp ↔ Date · Number Base (dec/hex/oct/bin) |
| **Color** | HEX ↔ RGB ↔ HSL with picker and swatch |
| **Crypto** | SHA-1/256/384/512 · UUID v4 · Password Generator |
| **Cipher** | Caesar · ROT13 |

## Productivity

- **Command palette** — press <kbd>⌘K</kbd> / <kbd>Ctrl K</kbd> to jump to any tool; <kbd>?</kbd> shows all shortcuts.
- **Shareable links** — the link button in the header copies a URL that restores the current tool *and* its input.
- **Input persistence** — what you type is remembered per tool across reloads.
- **Drag & drop** — drop a text file onto any input to load it.
- **Paste / Download / Swap** — one-click paste into inputs, download outputs, and pipe an encoder's result straight into its decoder.

## Getting started

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # production build -> dist/
npm run preview   # preview the production build
```

## Project structure

```
index.html          Entry point
src/
  main.js           App shell: sidebar, search, routing, theme
  registry.js       The list of every tool
  dom.js            Small DOM helpers (h, copyBtn, icons)
  panel.js          Reusable tool layouts (transformTool, ioBox)
  styles/           base.css (tokens + shell), components.css (widgets)
  tools/            One module per category
```

## Adding a tool

Each tool is a small object living in a module under `src/tools/`:

```js
{
  id: 'reverse',           // unique — also the URL hash (#reverse)
  category: 'Text',        // groups it in the sidebar
  name: 'Reverse',         // sidebar label
  title: 'Reverse Text',   // panel heading
  desc: 'Reverse a string.',
  mount(body) { /* build the UI into `body` */ },
}
```

For the common input-to-output shape, use the `transformTool` helper:

```js
import { transformTool } from '../panel.js';

export default [{
  id: 'reverse', category: 'Text', name: 'Reverse', title: 'Reverse Text',
  desc: 'Reverse a string.',
  mount: transformTool({ live: true, transform: (text) => [...text].reverse().join('') }),
}];
```

Import the module's array in `src/registry.js` and you're done — the sidebar, routing,
search, copy buttons, and theming are all wired up automatically.
