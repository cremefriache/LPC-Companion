# Rebuild from corresponding source

This publication includes the code, normalized catalog inputs, original local artwork, pinned upstream source/provenance and build scripts needed to reproduce its browser entry. Large maintainer experiment logs and historical evidence are maintained separately; they are not build dependencies.

Use Node.js 20.19 or newer and npm:

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run build
```

`check` verifies the published browser module against a fresh compilation of `src/`, and verifies pinned art/credits. `build` regenerates the root browser module, manifest and readable credits. Generated release inventory describes the original publication; local edits/rebuilds do not rewrite that historical inventory. Commit source and generated entrypoints together when proposing a change.

The build needs no private repository, Git history, upstream checkout, SillyTavern install or model provider. It checks the full local bank library and required compact provenance before compilation. Original source sheets remain unchanged; palettes apply during rendering.

- `src/`: catalog, composition, presentation, state and host adapter.
- `schemas/`: versioned presentation/state contracts.
- `assets/`: local character banks, curated sheets, scenes and readable credits.
- `vendor/`: upstream source, exact provenance and complete notices. Compact decode/color/credit records are retained because build verification uses them.
- `extension/`: source manifest and theme-inheriting styles.
- `tools/`: explicit build/credit-generation tools and selected synthetic test helpers.
- `test/`: focused public source/continuity/composition/license tests with synthetic data.

The focused public tests are a subset of maintainer acceptance. They do not establish live host compatibility or Android acceptance on their own. See [status](STATUS.md). For character-art and source licensing, see [upstream](UPSTREAM.md) and [NOTICE](../NOTICE.md).
