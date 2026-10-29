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

## Items from the token usage test

The items below come from a second stress test on 2026-10-29, where an agent rebuilt a screenshot of a landing page for Makalu in `tester.sketch`. The finished artboard has about 80 layers and took 3 build or update calls. The agent noted each place where a tool sent or returned more tokens than the work needed.

## Share repeated schemas in the tool definitions

`tools/list` returns 115,945 characters for 41 tools, and four of them are 16,737 to 18,463 characters each. Those four are `build_layers`, `create_layer`, `update_layer`, and `update_layers`, and each one carries a full copy of the layer schema. Zod also writes the color, fill, style, and text style schemas out in full each time a field uses them.

- [x] Give the shared schemas in `server/src/schemas.ts` an id with `.meta({ id })`, so zod puts each one in `definitions` once and every other use is a `$ref`. This cut `tools/list` from 115,945 to 106,618 characters, about 8%, because the field descriptions make up most of each tool's size and each one appears once.
- [x] Remove `create_layer` and `update_layer`, because `build_layers` with one node and `update_layers` with one entry do the same work and each of the two tools repeated the whole layer schema. With the `$ref` change, `tools/list` went from 115,945 to 77,541 characters.
- [x] Add a test that fails when `tools/list` grows past 80,000 characters.

## Return the ids of layers a later call will need

The `build_layers` reply gave ids only for the root layers and for nodes with a `ref`. The agent needed the ids of two background layers to change their gradients, so it called `get_layer` on the artboard, which returned about 3,000 tokens of styles and paths.

- [x] Say in the `build_layers` description and the `ref` description to set `ref` on any layer that a later call may change.

## Stop listing root groups twice in the `build_layers` reply

Each root that is a group appears in both `roots` and `groups`, with the same id, name, type, and frame.

- [x] Leave root layers out of `groups`.

## Set a text style once for many text layers

The second `build_layers` call repeated `fontFamily: "Avenir"` about 60 times, and the text color for each section on every text node in it.

- [x] Add `textStyle` to `build_layers`, used as the default for every text node in the call.
- [x] Let a group or artboard node take `textStyle`, used as the default for the text nodes inside it. A text node's own `textStyle` keys win over both defaults.

## Render part of an artboard

To check one section after a fix, the agent had to render the whole 1200 by 3122 artboard again at a scale of 0.35, which made the text too small to read.

- [x] Add `region` to `export_layers`, which crops the PNG to a rectangle given in the layer's coordinates, so a section can be checked at full size. A 460 by 140 region of the Visit Tokyo artboard at a scale of 1.5 came back as a 690 by 210 PNG.

## Return a short layer list from `get_layer`

`get_layer` with `depth: 1` returned the full path, style, and text style of each of the 40 children, even though the agent needed only ids and names.

- [x] Add `summary` to `get_layer`, which returns only the id, name, type, frame, visibility, text, and child count of each layer. On the Makalu artboard at `depth: 1`, the reply went from 10,319 to 5,878 characters.

## Search inside one artboard or group

`find_layers` takes a `pageId` and nothing narrower, so a name such as "Tint" matches layers in every artboard on the page.

- [x] Add `parentId` to `find_layers`, which searches only inside that artboard or group. "Tint" matched 3 layers on the page and 2 inside the Makalu artboard.

## Shorten the `list_fonts` reply

`list_fonts` returns a PostScript name for each face, and Avenir alone has 12 faces. The PostScript name is not used anywhere else in the tools.

- [x] Drop `postscriptName` from each face in `list_fonts` and `install_google_font`.

## Say where a new artboard can go

The agent listed all 18 artboards on the page to find empty space to the right of them for the new artboard.

- [x] Add `nextX` to the `list_artboards` reply, which is where `create_artboard` would place an artboard on that page when no x is given.

## Cut false overlaps from `find_overlaps`

`find_overlaps` reported 13 text layers, and only 1 was a real overlap, the Section I copy over the mountain photo.

- Two-line headings were reported against each other, because the box of one line touches the box of the next even though the letters don't touch.
- Text inside outline-only shapes, such as the hexes and the trail map diamond, was reported against the outline, because a shape without a fill does not count as holding the text.

- [x] Compare the letters of each line against other layers, using device metrics to measure the ink of each line from its baseline. The Makalu artboard now reports only the Section I copy over the photo, and moving "CLOUD'S PEAK" up 10 points made it report the two headings again.
- [x] Count a closed shape with a border and no fill as crossing the text only when a line is partly inside its outline and partly outside.

## Repeat a node in `build_layers`

The five side navs and the four section badges were nearly the same spec written out each time, with only the frame and one fill changed.

- [x] Add `copyOf` to `build_layers` nodes, which takes the `ref` of an earlier node in the same call and builds a copy of it. Fields given on the copy replace the source's fields, and children given on the copy are matched to the source's children by name.

## Shorten the paths `fetch_images` returns

Each path from `fetch_images` is about 110 characters, such as `/Users/<user>/.sketch-agent-bridge/images/<uuid>/dark-snowy-mountain-cliff-pine-trees-dus.jpg`, and the agent sends it again in each fill that uses it.

- [x] Return paths that start with `~/.sketch-agent-bridge/`, use a 12-character folder name, and name the files `1.jpg`, `2.jpg`, and so on. Accept paths that start with `~/` wherever an image or SVG file is taken. A path is now 48 characters.

## Name exported PNGs with the scale that was asked for

An export at a scale of 1.5 was named `@1x`, 0.35 was named `@0.3x`, and 0.25 was named `@0.2x`, even though each image was the size that was asked for.

- [x] Rename each exported PNG to `<layer id>@<scale>x.png` using the scale that was asked for.
