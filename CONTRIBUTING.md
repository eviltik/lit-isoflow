# Contributing to lit-isoflow

Thanks for taking the time to contribute!

## Getting started

```bash
git clone https://github.com/eviltik/lit-isoflow
cd lit-isoflow
pnpm install
pnpm run demo     # http://localhost:5173 — the demo is also the manual test bench
```

There is **no build step**: `src/` is plain ES modules with JSDoc types, and it is
what gets published. What you edit is what ships.

## Before opening a pull request

```bash
pnpm run check    # lint + formatting + unit tests
```

Individually:

| Command               | What it does                                   |
| --------------------- | ---------------------------------------------- |
| `pnpm run lint`       | ESLint (incl. `eslint-plugin-lit`)             |
| `pnpm run format`     | Prettier, writes                               |
| `pnpm run test`       | Node's built-in test runner (`test/*.test.js`) |
| `pnpm run build:demo` | Production build of the demo                   |

CI runs the same checks on every push and pull request.

## Project layout

```
src/
  config.js          tile geometry & defaults — DO NOT change the tile constants,
                     they are baked into every existing diagram
  schemas.js         zod model schema (Isoflow/FossFLOW-compatible JSON)
  scene.js           pure model → scene derivation (connector paths, textbox sizes)
  lit-isoflow.js     the <lit-isoflow> component: rendering, interaction, PNG export
  utils/             geometry engine (projection, bounding boxes, A* routing)
  editor/
    modes.js         interaction state machines (cursor, drag, connector, …)
    mutations.js     model mutations
demo/                the reference host app (toolbar, property panel, icon gallery)
test/                unit tests for the geometry engine and the model layer
```

## Guidelines

- **Keep the component dependency-light.** The whole point of this port is a lean
  canvas: `lit`, `zod`, `pathfinding` — that's it. UI kits, rich text editors and
  icon packs belong to the host app (see “Wiring a property panel” in the README);
  the demo shows how.
- **The model format is a contract.** It must stay interchangeable with
  Isoflow/FossFLOW exports. Changing `schemas.js` or the tile constants in
  `config.js` breaks existing diagrams — open an issue first.
- **Cover the pure layer with tests.** Geometry, scene derivation and mutations are
  all testable without a DOM; new logic there should come with tests.
- **Comment the "why", not the "what".** Especially where we deliberately deviate
  from upstream Isoflow — those deviations are listed in the README.

## Reporting bugs

Include the diagram JSON (or a minimal repro), the browser, and what you expected.
For rendering issues, a screenshot helps a lot.

## Licence

By contributing, you agree that your contributions are licensed under the MIT
licence, like the rest of the project.
