# To do

These items come from a stress test on 2026-10-29, where an agent rebuilt an AI-generated landing page image as vector art in `tester.sketch`. The finished artboard has 67 layers, including 11 SVG layers that a Python script generated. Every checked item below was done on 2026-10-29 and checked against Sketch 88.1.

## Say in the mask description that Sketch draws the mask's fill

A rectangle created with `mask: true` and a white fill clipped the layers above it and also rendered as a white block over the whole hero area. Sketch draws a mask layer's own fill, so a mask that should only clip needs `fills: []`. The `mask` description in `server/src/schemas.ts` did not say this.

- [x] Add a sentence to the `mask` description in `server/src/schemas.ts` saying that Sketch draws the mask layer's fill, and that `fills: []` makes a mask that only clips.
- [x] Add the same note to the paragraph on `mask: true` in `docs/protocol.md`.

## Let an agent place generated SVG files without turning off the Claude Code sandbox

`svgFile` only reads files inside `~/.sketch-agent-bridge/` or a folder in `SKETCH_AGENT_BRIDGE_ASSET_DIRS`. The Claude Code sandbox cannot write to `~/.sketch-agent-bridge/`, so the agent wrote the SVGs to `$TMPDIR` and needed the sandbox turned off for each `cp` into `~/.sketch-agent-bridge/art/`. Passing the SVGs inline through `svg` would have avoided the copy, but the dahlia SVG alone was 44 KB, and every inline SVG is sent as tokens in the tool call.

- [ ] Add a tool that takes SVG markup or a file in an allowed temp folder, writes it to `~/.sketch-agent-bridge/assets/<uuid>.svg`, and returns the path for `svgFile`. This was not built, because a tool that takes markup sends the same tokens as inline `svg`, and a tool that copies from a temp folder would let an agent read files from outside the allowed folders.
- [x] Document in `docs/install.md` how to add `~/.sketch-agent-bridge/assets/` to the Claude Code sandbox's write list. The server now creates that folder before each request, because a sandbox allowed to write only to `assets/` cannot create it.

## Replace the drawing in an SVG layer

After the first render, the petals were too thin and the SVGs were regenerated. `update_layer` had no `svg` or `svgFile` field, so the agent deleted the whole `Hero Botanicals` group and rebuilt all 12 layers, which meant sending the mask, the frames, and every layer's shadow again.

- [x] Add `svg` and `svgFile` to `update_layer`. The plugin imports the new SVG, puts it at the old layer's place in the layer list, and keeps the old layer's name, visibility, lock, and style. The test replaced the dahlia twice and kept its shadow and place between `Lotus Lower` and `Corner Bloom`.

## Update several layers in one call

Moving four nav links and narrowing the intro text took five separate `update_layer` calls, and each one ran `sketchtool` once.

- [x] Add an `update_layers` tool that takes a list of `update_layer` changes and renders once at the end. It looks up every id before the first change, so a list with an unknown id changes nothing.

## List the fonts installed on the Mac

The agent ran `ls` on the font folders to find out whether Baskerville and Avenir Next were installed before it set any text. The plugin already reads each family's weights when it sets text, and it warned that Baskerville has no weight 7 and used 8.

- [x] Add a `list_fonts` tool that returns each installed family and its weights on the Sketch weight scale, so an agent can pick fonts and weights before it creates text.
- [x] Add an `install_google_font` tool that downloads a family the user asks for from Google Fonts into `~/Library/Fonts` and adds it to a "Google Fonts" collection in Font Book. The test installed Playfair Display, and a text layer used its Black face without restarting Sketch.

## Report text that overlaps other layers

Three overlaps were found by looking at renders.

- The top petal of the dahlia ran under the "Collections" nav link.
- A small nav mark sat on top of the corner flower's petals.
- The first line of the intro touched a leaf.

`get_layer` with `textLines` reports text that overflows its own frame, but nothing reported text that sits on top of or under another visible layer.

- [x] Add a `find_overlaps` tool that lists each text layer that another visible layer crosses. Comparing frames alone reported the stripes behind the card and leaves near the headline, so it compares each wrapped line of text, tests shapes against their outlines, and skips layers hidden behind a layer that holds the whole text. With the nav link moved back to where it first was, it reported the dahlia crossing "Collections", and the finished artboard reports no overlaps.
