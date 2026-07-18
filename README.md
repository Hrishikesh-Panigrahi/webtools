# webTools

A collection of fast, **100% client-side** developer utilities. Everything runs in your
browser — nothing you type is ever sent anywhere.

Built with plain JavaScript and [Vite](https://vitejs.dev/) — no runtime framework, no
backend, no tracking.

## Tools

| Category | Tools |
|----------|-------|
| **JSON** | Prettify · Minify · Validate · Sort Keys · Compare (git-style diff) |
| **URL**  | Editable Parser — edit any part or query param and the URL rebuilds live |
| **Encode** | Base64 · URL · HTML escape/unescape · JWT decode |
| **Text** | Case Converter · Slugify · Word Counter · Lorem Ipsum |
| **Convert** | Unix Timestamp ↔ Date · Number Base (dec/hex/oct/bin) |
| **Color** | HEX ↔ RGB ↔ HSL with picker and swatch |
| **Crypto** | SHA-1/256/384/512 · UUID v4 |
| **Cipher** | Caesar · ROT13 |

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
  style.css         Theme tokens and all styling
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
