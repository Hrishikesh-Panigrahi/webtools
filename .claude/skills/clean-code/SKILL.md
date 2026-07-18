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
- Reach for existing helpers before writing new code: `transformTool` / `ioBox` from
  `panel.js`, and `h` / `copyBtn` / `icons` from `dom.js`.
- Keep functions small and single-purpose. If a function does two things, split it.
- Keep pure logic (a transform, a parse, a format) separate from DOM wiring so it can be
  reasoned about and tested on its own.

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
