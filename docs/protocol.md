# Bridge protocol

The MCP server talks to the plugin by running this command:

```sh
/Applications/Sketch.app/Contents/MacOS/sketchtool run <repo>/plugin/sketch-agent-bridge.sketchplugin bridge \
	--context='{"request":"<request JSON as a string>"}' --without-activating
```

`sketchtool run` loads the plugin bundle from the path given, so the plugin does not need to be installed for the bridge command to work. Sketch 88.1 passes each key of the `--context` dictionary to the command as a property of `context`. The request is sent as one JSON string under `request` so that no value goes through Cocoa type conversion.

## Request

```json
{ "op": "layer", "args": { "id": "..." }, "replyDir": "/Users/<you>/.sketch-agent-bridge/requests/<uuid>" }
```

The plugin refuses a `replyDir` that is not inside `~/.sketch-agent-bridge/` and writes no reply.

## Reply

The plugin writes `reply.json` into `replyDir`:

```json
{ "ok": true, "result": {}, "files": [{ "layerId": "...", "format": "png", "path": "..." }] }
```

On failure it writes `{ "ok": false, "error": "<message>" }`. Exported files go in `replyDir/exports/<layerId>/`. The server drops any file path outside `replyDir`, and it deletes request folders older than 24 hours.

A successful reply can also carry `"render": { "ids": [...], "scale": 1 }`. The plugin sends it from `build`, `createLayer`, and `updateLayer` whenever they set overrides, because an export in the same plugin run still shows the instance's previous overrides and the size it had before Smart Layout resized it. The server then runs the `export` op in a second plugin run and returns that PNG.

## Ops

Every op takes an optional `documentId`. Without it, the op uses the front document.

| Op                  | MCP tool              | Args                                                                                                                                                                                  |
| ------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status`            | `sketch_status`       | none                                                                                                                                                                                  |
| `pages`             | `list_pages`          | none                                                                                                                                                                                  |
| `artboards`         | `list_artboards`      | `pageId`                                                                                                                                                                              |
| `layer`             | `get_layer`           | `id`, `depth`, `includeHidden`                                                                                                                                                        |
| `selection`         | `get_selection`       | `depth`, `includeHidden`, `scale`, `svg`, `export`                                                                                                                                    |
| `export`            | `export_layers`       | `ids`, `formats`, `scale`                                                                                                                                                             |
| `tokens`            | `get_design_tokens`   | none                                                                                                                                                                                  |
| `find`              | `find_layers`         | `pageId`, `type`, `name`, `nameMatch`, `text`, `symbol`, `limit`                                                                                                                      |
| `symbols`           | `list_symbols`        | `includeOverrides`                                                                                                                                                                    |
| `libraries`         | `list_libraries`      | `libraryId`                                                                                                                                                                           |
| `reveal`            | `reveal_layer`        | `id`                                                                                                                                                                                  |
| `build`             | `build_layers`        | `parentId`, `nodes`                                                                                                                                                                   |
| `createArtboard`    | `create_artboard`     | `pageId`, `name`, `x`, `y`, `width`, `height`, `style`                                                                                                                                |
| `createLayer`       | `create_layer`        | `parentId` and one layer node                                                                                                                                                         |
| `updateLayer`       | `update_layer`        | `id`, `name`, `hidden`, `frame`, `text`, `cornerRadius`, `symbol`, `overrides`, `style`, `textStyle`, `fixedWidth`, layout fields, `flow`, `flowStartPoint`, `exportFormats`, `order` |
| `groupLayers`       | `group_layers`        | `ids`, `name`                                                                                                                                                                         |
| `ungroupLayer`      | `ungroup_layer`       | `id`                                                                                                                                                                                  |
| `duplicate`         | `duplicate_layer`     | `ids`, `offset`, `name`                                                                                                                                                               |
| `createSymbol`      | `create_symbol`       | `ids`, `name`, `replace`                                                                                                                                                              |
| `detach`            | `detach_symbol`       | `id`, `recursively`, `force`                                                                                                                                                          |
| `applySharedStyle`  | `apply_shared_style`  | `id`, `sharedStyle`                                                                                                                                                                   |
| `upsertSwatch`      | `upsert_swatch`       | `name`, `color`                                                                                                                                                                       |
| `upsertSharedStyle` | `upsert_shared_style` | `kind`, `name`, `fromLayerId`, `style`, `textStyle`                                                                                                                                   |
| `deleteLayer`       | `delete_layer`        | `id` or `ids`, `force`                                                                                                                                                                |

These tools do not call the plugin:

- `list_inbox` and `get_inbox_item` read `~/.sketch-agent-bridge/inbox/`.
- `fetch_images` runs the `get_images` shell function. See [Fetching images](#fetching-images).

## Finding layers

`find` searches the whole document, or the page given by `pageId`. It passes only `type` to Sketch's `sketch.find`, and it filters by `name`, `text`, and `symbol` in the plugin, so text from the agent never goes into a `sketch.find` selector. `name` and `text` match case-insensitive substrings, and `nameMatch: "exact"` makes `name` match the whole name. `text` searches the text of text layers, which does not include override text inside symbol instances. `symbol` finds the instances of a master given by name, id, or symbol id.

The reply has `total`, `truncated` when there are more than `limit` matches (default 50), and for each match its `id`, `name`, `type`, `frame`, `page`, and `artboard`, plus `hidden` when the layer is hidden.

`symbols` lists each symbol master with `id`, `name`, `symbolId`, `page`, `instanceCount`, `smartLayout`, and `library` when the master came from a library. With `includeOverrides`, each master also lists its overrides with `editable`.

## Libraries

`libraries` lists the enabled libraries with `id`, `name`, `libraryType`, and `valid`. With `libraryId`, which is a library id or name, it also lists the names of the library's `symbol`, `layerStyle`, `textStyle`, and `swatch` items.

There is no separate import op. When a write op looks up a symbol, shared style, or swatch by name or id and the document does not have it, the plugin searches the enabled libraries and imports the first match in the same plugin run. Sketch removes an imported library swatch from the document when no layer uses it, so a swatch imported in one run and used in a later run can be gone by then. Symbols and shared styles have not been tested for this, and the plugin imports them the same way. `document.swatches` in Sketch's API lists only local swatches, so the plugin also reads the document's foreign swatches when it looks up a swatch.

## Reveal

`reveal` switches the document to the layer's page, selects the layer, and calls `document.centerOnLayer` to scroll the canvas to it. It changes no layer data, so the server sends it without a backup or the saved-document check. The reply has `selected` and `centered`. A page id switches to that page and selects nothing.

## Layer nodes

`build` takes a list of nodes, and `createLayer` takes one. A node has a `kind` and these optional fields:

- `name`, `frame`, `hidden`, `style`, `textStyle`, and `sharedStyle` for every kind
- `cornerRadius` for `rectangle`
- `text` and `fixedWidth` for `text`. A text node with a frame width gets a fixed width unless `fixedWidth` is false.
- `svg` for `svg`, as SVG markup. The frame width and height are written onto the root `<svg>` tag, so the drawing scales to that size.
- `image` for `image`, as an absolute path to an image file
- `symbol` and `overrides` for `symbol`
- `children` for `group` and `artboard`
- `ref`, a label the `build` reply maps to the new layer's id
- the layout fields `smartLayout` for `group`, and `rotation`, `flipHorizontal`, and `flipVertical` for every kind
- `flow` and `exportFormats` for every kind, and `flowStartPoint` for `artboard`

The kinds are `artboard`, `rectangle`, `oval`, `text`, `group`, `symbol`, `svg`, and `image`. An artboard node needs a page as its parent. Child frames are relative to their parent, and each group shrinks to fit its children once they are all created. If any node fails, `build` removes everything it created in that call.

## Write ops

- Every write op refuses a document that has never been saved.
- Before the first write op on a document in a server session, the server runs `status` to find the document's file and copies it to `~/.sketch-agent-bridge/backups/<name>-<timestamp>.sketch`. The copy is of the file on disk, so edits made in Sketch since the last save are not in it.
- Each write op is one step in Sketch's undo history, so Cmd+Z in Sketch undoes the whole op.
- Layers created by a write op get the layer setting `createdByAgent`, which `deleteLayer` checks unless `force` is true.
- Changing a text layer's text keeps its name when the name was set to something other than the old text.
- Swapping an instance to another symbol renames it to the new symbol, unless the instance had a name of its own.

### Colors and fills

A color is a hex string (`#rrggbb` or `#rrggbbaa`) or `{ "swatch": "<name or id>" }`. A swatch color stays linked to the swatch. A fill is a color or one of these:

- `{ "gradient": { "type": "linear", "from": { "x": 0, "y": 0 }, "to": { "x": 1, "y": 1 }, "stops": [{ "position": 0, "color": "#000" }, ...] } }`, where `type` is `linear`, `radial`, or `angular`, and points are fractions of the layer size
- `{ "image": "/absolute/path.jpg", "mode": "fill" }`, where `mode` is `fill`, `fit`, `tile`, or `stretch`

Images can be PNG, JPEG, GIF, TIFF, WebP, HEIC, or BMP files.

An artboard takes a single color fill, which the plugin writes to the artboard's background color, because Sketch draws an artboard's background color and ignores style fills on it. Gradients and images go on a rectangle inside the artboard.

### Effects and borders

`style` also takes these keys:

- `innerShadows`, in the same form as `shadows`
- `blur`, as `{ "type": "Background", "radius": 12 }`, where `type` is `Gaussian`, `Motion`, `Zoom`, or `Background`, and `motionAngle` sets the angle of a `Motion` blur. `null` turns blur off.
- `blendingMode`, which is one of the names in Sketch's `Style.BlendingMode`, such as `Multiply` or `Screen`
- `borderOptions`, with `dashPattern`, `lineEnd` (`Butt`, `Round`, `Projecting`), `lineJoin` (`Miter`, `Round`, `Bevel`), `startArrowhead`, and `endArrowhead`. Arrowheads are `None`, `OpenArrow`, `FilledArrow`, `Line`, `OpenCircle`, `FilledCircle`, `OpenSquare`, or `FilledSquare`, and they draw on open paths such as a line from an SVG.

Assigning `style.borderOptions` in Sketch's API resets every key left out to its default, so the plugin sets each key that is given and leaves the others unchanged.

`textStyle` also takes `textUnderline` and `textStrikethrough`, which are `none`, `single`, `double`, or `thick`.

### Text alignment

Sketch 88.1 writes text alignment with the raw values AppKit uses on Intel Macs. On Apple Silicon, AppKit's raw values for center and right are swapped, so a layer set to `center` through Sketch's API renders right-aligned. The plugin swaps `center` and `right` on both write and read when `NSTextAlignmentCenter` is 1, which makes the alignment in requests and specs match what renders.

### Layout and order

`smartLayout` is one of `LeftToRight`, `HorizontallyCenter`, `RightToLeft`, `TopToBottom`, `VerticallyCenter`, or `BottomToTop`, and `null` turns it off. It applies to groups and symbol masters. After `setOverrides` changes an instance whose master has a smart layout, the plugin calls `resizeWithSmartLayout()` on the instance, so the instance grows or shrinks to fit its new override text.

`updateLayer` takes `order`, which is `front`, `back`, `forward`, `backward`, or an index in the parent where 0 is the back.

`duplicate` copies each layer into the same parent, directly above the original, and moves the copy by `offset`. Each copy gets the `createdByAgent` setting.

### Prototypes and export presets

`flow` is `{ "target": "<artboard id>", "animation": "slideFromLeft" }`, where `target` can also be `"back"` to return to the previous artboard, and `animation` is `none`, `slideFromRight`, `slideFromLeft`, `slideFromBottom`, or `slideFromTop`, with `slideFromRight` as the default. `null` removes the link. `flowStartPoint: true` marks an artboard as a prototype start point.

`exportFormats` replaces a layer's export presets with a list of `{ "fileFormat": "png", "size": "2x", "prefix": "", "suffix": "@2x" }`. `fileFormat` is `png`, `jpg`, `tiff`, `webp`, `gif`, `pdf`, `eps`, or `svg`. `size` is a scale such as `2x`, a width such as `300w`, or a height such as `200h`, and defaults to `1x`. An empty list removes the presets.

### Symbols

`createSymbol` makes a new symbol master on the Symbols page from the given layers. By default it moves the layers into the master and puts an instance where they were. With `replace` set to false, it copies the layers into the master and leaves the originals in place. Its reply lists the overrides the symbol exposes, by layer name and property.

Overrides are set with a list of `{ "layer": "<layer name inside the symbol>", "value": "..." }`, or `{ "id": "<override id>", "value": "..." }`. A text layer has both a `stringValue` and a `textStyle` override, and matching by layer name picks `stringValue` unless `property` says otherwise. The value is text for `stringValue`, a symbol name for `symbolID`, and an absolute image path for `image`. The plugin refuses an override that the symbol master marks as not editable, which `symbols` with `includeOverrides` reports as `editable: false`.

`detach` replaces an instance with a group of its layers and keeps the instance's overrides. With `recursively`, nested instances are detached too. It refuses an instance without the `createdByAgent` setting unless `force` is true, and the new group gets the setting when the instance had it.

Variants of one component are separate masters with slash names, such as `Feature Row/Left` and `Feature Row/Right`. `updateLayer` with `symbol` swaps an instance between them.

### Token use

Write replies are sized to keep the agent's context small:

- `createArtboard`, `createLayer`, `updateLayer`, `applySharedStyle`, `groupLayers`, and `detach` return only `id`, `name`, `type`, and `frame` unless `verbose` is true. `build`, `ungroupLayer`, `createSymbol`, and `duplicate` return the same short form for each layer they report on, and they ignore `verbose`.
- `render` picks what the reply renders as a PNG: `none`, `layer`, or `artboard`. `build` defaults to `artboard` and renders once. The other ops that take `render` default to `layer`. `upsertSwatch`, `upsertSharedStyle`, and `deleteLayer` never render.
- PNGs render at 1x unless `scale` says otherwise.
- JSON in replies has no indentation.

## Fetching images

`fetch_images` runs the `get_images` shell function from the file named by the `SKETCH_AGENT_BRIDGE_GET_IMAGES` environment variable. The function asks Unsplash's random photo endpoint for photos that match the query, using the access key it reads from the login keychain, under the service name `unsplash_access_key`, and downloads the photos as JPEGs into a new folder under `~/.sketch-agent-bridge/images/`. The server never reads the key.

The server runs the function with `/bin/zsh -f -c`, and the search text and sizes go in as separate shell parameters, so text from the agent is never parsed as shell code. The shell gets only `HOME`, `USER`, and `PATH` from the environment.

## Layer spec

Each layer has `id`, `name`, `type`, and `frame`. These keys appear only when they have a value:

- `children`, or `childCount` with `truncated: true` on the root when the depth limit or the 2000-layer limit cut the tree
- `hidden`, `locked`, `rotation`, `flippedHorizontally`, `flippedVertically`
- `smartLayout` for groups and symbol masters
- `shapeType` and `cornerRadius` for shape paths
- `text`, `textStyle`, and `fixedWidth` for text layers, where `alignment` is left out when it is `left` and `verticalAlignment` is left out when it is `top`
- `style` with `opacity`, `fills`, `borders`, `borderOptions`, `shadows`, `innerShadows`, `blur`, and `blendingMode`. A color linked to a swatch also has `swatch`, a gradient fill has `gradient` and `stops`, and an image fill is `{ "image": true }`. `borderOptions` and `blendingMode` appear only when they differ from Sketch's defaults.
- `sharedStyle` with the shared style name
- `symbol`, `symbolId`, and `overrides` for symbol instances, where `overrides` lists only overrides changed from the default
- `flow` with `target`, `targetName`, and `animation`, where `target` is `back` for a back link
- `flowStartPoint` for artboards
- `exportFormats` with `fileFormat`, `size`, and `prefix` or `suffix` when set
