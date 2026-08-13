---
name: clean-code
description: Coding standards for webTools — write modular, readable, self-documenting JavaScript with clear names and few comments. Invoke before writing or refactoring any code in this repo so structure and style stay consistent.
---

# Clean code

Write code a new reader understands on the first pass, without a comment telling them what
it does. Follow these rules for every change in this repo.

## Modularity
- One tool is one small object (`id`, `category`, `name`, `title`, `desc`, `mount`) in a
  module under `src/tools/`. Register it in `src/registry.js`. Nothing else needs editing.
- Reach for existing helpers before writing new code: `transformTool` / `ioBox` /
  `filePicker` from `panel.js`, `h` / `copyBtn` / `icons` from `dom.js`, and
  `formatBytes` / `formatDelta` from `format.js`.
- Keep functions small and single-purpose. If a function does two things, split it.
- Keep pure logic (a transform, a parse, a format) in its own module at the `src/` root,
  separate from DOM wiring. A tool module builds UI; it does not implement an algorithm.

## Tests
- Every module at the `src/` root is plain ESM with no DOM dependency, so `test/` imports
  it directly. Run them with `npm test` (Node's built-in runner — no framework, no deps).
- New pure logic ships with tests. Cover the edges you had to think about, not just the
  happy path: empty input, the largest value that fits, the smallest that doesn't, and
  whatever malformed input the parser must reject.
- Prefer a test that verifies a property over one that pins an expected string. The QR
  tests decode what the encoder produced rather than comparing stored matrices, which is
  why they catch a wrong lookup table instead of enshrining it.
- Tool `mount` functions are checked by hand in the browser; don't contort them to be
  unit-testable, move the logic out instead.

## Naming
- Use full, descriptive words. Functions are verbs (`rebuild`, `collectParams`,
  `parseColor`); values are nouns (`paramRows`, `digest`, `swatch`).
- Only use abbreviations that are universal in the domain (`url`, `id`, `rgb`, `hsl`).
  Never invent cryptic short names (`tmp`, `x2`, `arr`).
- Booleans read as yes/no questions (`isCollapsed`, `isMobile`).

## Comments
- Prefer clear code over comments. Do not narrate what the code plainly does.
- Comment only the non-obvious *why*: a tricky edge case, a workaround, a deliberate choice.
- Delete commented-out code and leftover `console.log`.

## Style
- Modern JS: `const`/`let`, arrow functions, template literals, optional chaining, `??=`.
- 2-space indent, semicolons, single quotes — match the surrounding files.
- No dead code, no unused variables, no premature abstractions.
