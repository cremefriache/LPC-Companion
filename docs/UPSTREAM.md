# The people and projects behind the pixels

LPC Companion is an integration and presentation layer. The underlying character artwork, palettes and generator work come from the Liberated Pixel Cup ecosystem. The two upstream sources below have distinct roles; we retain their exact pins rather than treating the live generator as a changing runtime dependency.

## Modern LPC: our starting point

[codyaboyd’s Universal LPC Modern Sprite Generator](https://github.com/codyaboyd/Universal-LPC-Modern-Sprite-Generator) is the modern fork used for our original rendering proof and curated character foundation. Its layered character work made this project practical. Reviewed sitting/gesture sheets and several later curated additions also come from this pin.

- Exact revision: [`7736d762aa2113f29342dad869ef4931218aa7ae`](https://github.com/codyaboyd/Universal-LPC-Modern-Sprite-Generator/tree/7736d762aa2113f29342dad869ef4931218aa7ae).
- Extracted functions, source locations and licensing: [renderer provenance](../vendor/lpc/provenance.json).
- Initial proof, original attribution and reproduction: [corresponding source build](DEVELOPMENT.md) and its [notice](../NOTICE.md).
- Subsequent curated assets retain their own `vendor/lpc/*-provenance.json` records.

Please visit the fork and acknowledge its contributors when building on that work. LPC Companion is a separate project; its release and compatibility claims are our responsibility.

## Universal LPC: the complete pinned catalog

The parent [Universal LPC Spritesheet Character Generator](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator) supplies the complete catalog adopted by the Full catalog studio. Its community-maintained definitions, original artwork paths, palettes and attribution form the library’s source of truth.

- Exact revision: [`86160e7507d6841259cff624a51a63c1d4847ee3`](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator/tree/86160e7507d6841259cff624a51a63c1d4847ee3).
- [Use the live generator](https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator/), then bring its version 2 JSON export into the extension.
- [Pinned provenance](../vendor/lpc/full-catalog/provenance.json), [local library](USER_GUIDE.md), [content contract](USER_GUIDE.md) and [reviewed source gaps](USER_GUIDE.md).

The live site can advance beyond this revision. Imports resolve against verified local data, and a complete inventory does not mean every combination or animation has artwork. Missing source cells remain unavailable rather than being fabricated.

## Thank you to the artists

The character art includes contributions from bluecarrot16, JaidynReiman, Eliza Wyatt (ElizaWy), Benjamin K. Smith (BenCreating), Johannes Sjölund (wulax), Stephen Challener (Redshrike), Matthew Krohn (makrohn), Evert, TheraHedwig, MuffinElZangano, Durrani and many others. This acknowledgement is deliberately incomplete: **original per-item and per-path records are the authoritative attribution**, including other authors, notes and source URLs.

Use **Artwork & code credits** / **Full artwork credits** in the installed extension for the readable offline records. The repository also keeps [curated credits](../assets/lpc/credits-data.json), [source metadata](../assets/lpc/source-catalog.json), [full-catalog records](../vendor/lpc/full-catalog/) and [notices](../assets/lpc/NOTICE.md). Package exports include the credits and full selected license notices applicable to their selected art.

## Keep the licensing distinctions

The project code and GPL-derived renderer are accompanied by [GPL-3.0](../LICENSE), [scope/third-party notices](../NOTICE.md) and corresponding LPC source. Artist records may offer different license alternatives; selected artwork licenses are recorded individually, alongside the original alternatives. CC0 for one item does not make other items CC0. Keep the applicable notices and records with redistributed characters and rendered artwork.

The three repository-authored geometric scene backdrops are separately MIT-licensed; their [scene catalog](../assets/lpc/scenes.json) records authorship and license information. README screenshots include those scenes and credited LPC characters. The decorative README cover is an original SVG; [its media notice](media/README.md) identifies its separate license.

SillyTavern is also an independent upstream project. Visit [SillyTavern](https://github.com/SillyTavern/SillyTavern) for its own source, documentation and license. The extension does not imply endorsement by any upstream project or artist.
