# Bridge protocol

The MCP server talks to the plugin by running this command:

```sh
/Applications/Sketch.app/Contents/MacOS/sketchtool run <repo>/plugin/sketch-agent-bridge.sketchplugin bridge \
	--context='{"requestDir":"/Users/<you>/.sketch-agent-bridge/requests/<uuid>"}' --without-activating
```

`sketchtool run` loads the plugin bundle from the path given, so the plugin does not need to be installed for the bridge command to work. Sketch 88.1 passes each key of the `--context` dictionary to the command as a property of `context`.

## Request

The server makes the request folder with mode 0700 and writes `request.json` into it with mode 0600:

```json
{ "op": "layer", "args": { "id": "..." }, "assetDirs": ["/Users/<you>/Design/Assets"] }
```

The server writes the request to a file because other users on the Mac can read a process's arguments with `ps`, and a large request could go over the system's limit on argument size.

The plugin refuses a `requestDir` that is not inside `~/.sketch-agent-bridge/` and writes no reply. The request folder is also the reply folder, called `replyDir` below.

## Reply

The plugin writes `reply.json` into `replyDir`:

```json
{ "ok": true, "result": {}, "files": [{ "layerId": "...", "format": "png", "path": "..." }] }
```

On failure it writes `{ "ok": false, "error": "<message>" }`. Exported files go in `replyDir/exports/<layerId>/`. The server drops any file path outside `replyDir`. At the start of each request, it deletes request folders older than 24 hours, and folders in `images/` and `inbox/` older than 7 days.

A successful reply can also carry `"render": { "ids": [...], "scale": 1 }`. The plugin sends it from `build` and `createLayer` when they place a symbol instance or set overrides, and from `updateLayer` when it sets overrides or swaps the symbol. An export in the same plugin run still shows the instance's previous overrides and the size it had before Smart Layout resized it, and it leaves out symbols imported from a library during that run. The server then runs the `export` op in a second plugin run and returns that PNG.

A successful reply can also carry `"warnings": ["..."]` when the op finished but Sketch did not do exactly what was asked. The server puts each warning at the top of the tool result, prefixed with `Warning:`. After applying a text style that sets `fontFamily` or `fontWeight`, the plugin reads both back, because Sketch uses the closest installed font without reporting it. The plugin warns when the family is not installed, or when the family has no face at the requested weight, and the weight warning lists the weights the family does have.

## Ops

Every op takes an optional `documentId`. Without it, the op uses the front document.

| Op                  | MCP tool              | Args                                                                                                                                                                                                                                                                                      |
| ------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status`            | `sketch_status`       | none                                                                                                                                                                                                                                                                                      |
| `pages`             | `list_pages`          | none                                                                                                                                                                                                                                                                                      |
| `artboards`         | `list_artboards`      | `pageId`                                                                                                                                                                                                                                                                                  |
| `layer`             | `get_layer`           | `id`, `depth`, `includeHidden`, `textLines`                                                                                                                                                                                                                                               |
| `selection`         | `get_selection`       | `depth`, `includeHidden`, `textLines`, `scale`, `svg`, `export`                                                                                                                                                                                                                           |
| `export`            | `export_layers`       | `ids`, `formats`, `scale`, `trimmed`, `background`                                                                                                                                                                                                                                        |
| `tokens`            | `get_design_tokens`   | none                                                                                                                                                                                                                                                                                      |
| `find`              | `find_layers`         | `pageId`, `type`, `name`, `nameMatch`, `text`, `symbol`, `sharedStyle`, `swatch`, `limit`                                                                                                                                                                                                 |
| `symbols`           | `list_symbols`        | `includeOverrides`                                                                                                                                                                                                                                                                        |
| `libraries`         | `list_libraries`      | `libraryId`, `includeDisabled`                                                                                                                                                                                                                                                            |
| `reveal`            | `reveal_layer`        | `id`                                                                                                                                                                                                                                                                                      |
| `select`            | `select_layers`       | `ids`                                                                                                                                                                                                                                                                                     |
| `updateLibrary`     | `update_library`      | `path`, or `libraryId` and `enabled`                                                                                                                                                                                                                                                      |
| `build`             | `build_layers`        | `parentId`, `nodes`, `relativeTo`, `order`                                                                                                                                                                                                                                                |
| `createArtboard`    | `create_artboard`     | `pageId`, `name`, `x`, `y`, `width`, `height`, `style`                                                                                                                                                                                                                                    |
| `createLayer`       | `create_layer`        | `parentId`, `relativeTo`, and one layer node                                                                                                                                                                                                                                              |
| `updateLayer`       | `update_layer`        | `id`, `parentId`, `name`, `hidden`, `locked`, `frame`, `relativeTo`, `text`, `lineSpacing`, `cornerRadius`, `path`, `symbol`, `overrides`, `editableOverrides`, `style`, `textStyle`, `fixedWidth`, layout fields, `booleanOperation`, `flow`, `flowStartPoint`, `exportFormats`, `order` |
| `groupLayers`       | `group_layers`        | `ids`, `name`                                                                                                                                                                                                                                                                             |
| `combineShapes`     | `combine_shapes`      | `ids`, `operation`, `name`                                                                                                                                                                                                                                                                |
| `ungroupLayer`      | `ungroup_layer`       | `id`                                                                                                                                                                                                                                                                                      |
| `duplicate`         | `duplicate_layer`     | `ids`, `offset`, `name`                                                                                                                                                                                                                                                                   |
| `createSymbol`      | `create_symbol`       | `ids`, `name`, `replace`                                                                                                                                                                                                                                                                  |
| `detach`            | `detach_symbol`       | `id`, `recursively`, `force`                                                                                                                                                                                                                                                              |
| `convertSymbol`     | `convert_symbol`      | `id`, `to`, `force`                                                                                                                                                                                                                                                                       |
| `syncLibraryItem`   | `sync_library_item`   | `kind`, `id`, `action`                                                                                                                                                                                                                                                                    |
| `applySharedStyle`  | `apply_shared_style`  | `id`, `sharedStyle`                                                                                                                                                                                                                                                                       |
| `upsertSwatch`      | `upsert_swatch`       | `name`, `color`                                                                                                                                                                                                                                                                           |
| `upsertSharedStyle` | `upsert_shared_style` | `kind`, `name`, `fromLayerId`, `style`, `textStyle`                                                                                                                                                                                                                                       |
| `deleteLayer`       | `delete_layer`        | `id` or `ids`, `force`                                                                                                                                                                                                                                                                    |
| `createPage`        | `create_page`         | `name`                                                                                                                                                                                                                                                                                    |
| `updatePage`        | `update_page`         | `id`, `name`, `index`                                                                                                                                                                                                                                                                     |
| `deletePage`        | `delete_page`         | `id`, `force`                                                                                                                                                                                                                                                                             |
| `updateDocument`    | `update_document`     | `colorSpace`, `convert`                                                                                                                                                                                                                                                                   |
| `save`              | `save_document`       | none                                                                                                                                                                                                                                                                                      |

These tools do not call the plugin:

- `list_inbox` and `get_inbox_item` read `~/.sketch-agent-bridge/inbox/`.
- `fetch_images` calls the Unsplash API. See [Fetching images](#fetching-images).

## Finding layers

`find` searches the whole document, or the page given by `pageId`. It passes only `type` to Sketch's `sketch.find`, and it filters by `name`, `text`, and `symbol` in the plugin, so text from the agent never goes into a `sketch.find` selector. `name` and `text` match case-insensitive substrings, and `nameMatch: "exact"` makes `name` match the whole name. `text` searches the text of text layers, which does not include override text inside symbol instances. `symbol` finds the instances of a master given by name, id, or symbol id. `sharedStyle` finds the layers linked to a shared layer style or text style given by name or id.

`swatch` finds the layers that use a swatch, given by name or id, in a fill, gradient stop, border, shadow, text color, artboard background, or `fillColor` override. The plugin gets each layer's swatches from `swatchesReferencedInDocument:` on the native layer. That list also holds every swatch the layer's children use, so a layer counts as a match only when it lists the swatch more times than its children do together. A symbol instance's list leaves out its master's swatches, so an instance matches only through its own overrides. A `find` call by `swatch` over the 2470 layers of a test document took about 2 seconds, including the time `sketchtool` takes to start.

The reply has `total`, `truncated` when there are more than `limit` matches (default 50), and for each match its `id`, `name`, `type`, `frame`, `page`, and `artboard`, plus `hidden` when the layer is hidden.

`symbols` lists each symbol master with `id`, `name`, `symbolId`, `page`, `instanceCount`, `smartLayout`, and `library` when the master came from a library. With `includeOverrides`, each master also lists its overrides with `editable`.

## Libraries

`libraries` lists the enabled libraries with `id`, `name`, `libraryType`, and `valid`. With `libraryId`, which is a library id or name, it also returns the library's items:

- `counts`, with the number of `symbol`, `layerStyle`, `textStyle`, and `swatch` items
- `items`, with up to `limit` names of each kind (default 50)
- `matches`, with the number of names of each kind that passed the filters

`kind` lists only one kind of item, and `search` keeps names that contain every word in it, case-insensitive. Apple's iOS UI library has 2418 symbols and 816 text styles, and listing every name in it returned about 211 KB of JSON, so the names are capped.

With `includeDisabled`, `libraries` lists every library Sketch knows, and each one has `enabled`.

`updateLibrary` adds the `.sketch` file at `path` to Sketch's libraries, or turns the library given by `libraryId` on or off with `enabled`. Adding a file that is already a library returns the existing library. The change applies to Sketch's library list, which every document shares, so the server runs it without a backup and Cmd+Z does not undo it. There is no op to remove a library.

`syncLibraryItem` works on a symbol master, layer style, or text style that came from a library, found by id, symbol id, or name. `sync` updates it to the library's current version. `unlink` turns it into a local item with a new id, and a symbol master moves to the Symbols page. Both refuse an item that did not come from a library.

There is no separate import op. When a write op looks up a symbol, shared style, or swatch by name or id and the document does not have it, the plugin searches the enabled libraries and imports the first match in the same plugin run. Sketch removes an imported library swatch from the document when no layer uses it, so a swatch imported in one run and used in a later run can be gone by then. Symbols and shared styles are imported the same way. A library symbol brings the nested symbols it uses with it, and `symbols` reports each one with `library` and no `page`. A symbol master from a library is on no page, so Sketch's `getLayerWithID` does not find it. Every op that takes a layer id refuses a library master's id with a message that names the library and says to unlink it with `syncLibraryItem`.

Assigning a library text style with `syncWithSharedStyle` links the style without changing the text layer's font, size, or frame, so for a text layer the plugin first copies the shared style onto the layer with `layer.style = shared.style` and then links it. `document.swatches` in Sketch's API lists only local swatches, so the plugin also reads the document's foreign swatches when it looks up a swatch.

## Export

`export` writes each layer as `png`, `svg`, or `json` into `replyDir/exports/<layerId>/`. The server returns a PNG as an image and an SVG as its markup. JSON is the layer in Sketch's file format, which Sketch writes with `sketch.export`, and the server returns it as text when it is 100 KB or smaller and as a path otherwise. One artboard in the test document came to 510 KB of JSON.

`trimmed` and `background` change PNGs only. Sketch crops a PNG to its visible content unless `trimmed` is false, and with `false` the PNG covers the layer's whole frame. `background` is a hex color painted behind the content, and Sketch ignores it for SVG.

## Reveal

`reveal` switches the document to the layer's page, selects the layer, and calls `document.centerOnLayer` to scroll the canvas to it. It changes no layer data, so the server sends it without a backup or the saved-document check. The reply has `selected` and `centered`. A page id switches to that page and selects nothing.

## Select

`select` selects the layers given by `ids` and switches to their page. The layers must all be on one page, and an empty list clears the selection. Like `reveal`, it changes no layer data and runs without a backup. The reply has `page` and `selected`, with the id and name of each selected layer.

## Layer nodes

`build` takes a list of nodes, and `createLayer` takes one. A node has a `kind` and these optional fields:

- `name`, `frame`, `hidden`, `style`, `textStyle`, and `sharedStyle` for every kind
- `cornerRadius` for `rectangle`
- `text`, `textRuns`, `fixedWidth`, and `lineSpacing` for `text`. A text node with a frame width gets a fixed width unless `fixedWidth` is false. `lineSpacing` is `natural`, `system`, `variable`, or `constantBaseline`.
- `path` for `path`, as SVG path data in the parent's coordinates. The layer's frame fits the path, and a `frame` moves or resizes it with only the keys given. Sketch's `ShapePath.fromSVGPath` keeps only the first subpath, so the plugin splits path data at each moveto. Data with one subpath becomes a `ShapePath`, and data with several becomes a `Shape` that holds one `ShapePath` per subpath with no boolean operation and a nonzero fill rule, which is how Sketch imports an SVG path. A relative moveto that starts a later subpath is made absolute first, because it depends on where the previous subpath ended.
- `svg` for `svg`, as SVG markup. The frame width and height are written onto the root `<svg>` tag, so the viewBox scales to that size. Sketch trims the empty space around imported SVG content, so the plugin adds an invisible rect the size of the viewBox, uses it to place the drawing where it sits in the viewBox, and then removes it. The layer's frame ends up the size of the drawing, which can be smaller than the requested frame. When the frame gives only a width or only a height, the plugin sets the other from the viewBox's aspect ratio. `svgFile` takes an absolute path to a `.svg` file in place of `svg`, and the plugin reads the markup from that file.
- `image` for `image`, as an absolute path to an image file
- `symbol` and `overrides` for `symbol`
- `children` for `group` and `artboard`
- `ref`, a label the `build` reply maps to the new layer's id
- the layout fields `smartLayout` for `group`, `mask` for shapes and images, and `rotation`, `flipHorizontal`, `flipVertical`, `breaksMask`, and `resizing` for every kind, and `layoutGrid` and `grid` for `artboard`
- `booleanOperation` for the children of a `shape` node, in `build` only
- `flow` and `exportFormats` for every kind, and `flowStartPoint` for `artboard`

The kinds are `artboard`, `rectangle`, `oval`, `triangle`, `polygon`, `star`, `path`, `text`, `group`, `symbol`, `svg`, `image`, `hotspot`, and `slice`, and `build` also takes `shape`. A `hotspot` node is an invisible clickable area for a prototype, and the plugin refuses one without a `flow`. A `slice` node marks an area of the canvas for export, and its `exportFormats` set the files Sketch makes from it. `export` on a slice exports everything inside its area. A slice has no style, so the plugin refuses `style`, `textStyle`, and `sharedStyle` on it. A slice can also carry a `flow`, and Sketch's prototype preview follows it when the slice's area is clicked. A `shape` node combines two or more children of the kinds `rectangle`, `oval`, `triangle`, `polygon`, `star`, `path`, or `shape` into one Sketch Shape, and `createLayer` refuses it because a shape needs children. An artboard node needs a page as its parent. Child frames are relative to their parent's requested frame, and each group shrinks to fit its children once they are all created. Sketch refits a group as soon as a styled text layer inside it changes size, which would shift the siblings built after it. So `build` creates every layer in the nearest artboard or page, offset to where its group will be, and moves the layers into their groups at the end. When `parentId` is a group, the new layers move into it the same way, and it shrinks to fit. If any node fails, `build` removes everything it created in that call. The reply has `created`, `roots`, `groups`, and `refs`, where `groups` lists every group and shape node with its final frame in its parent's coordinates. A group's final frame can differ from the node's requested frame, because the group shrinks to fit its children, and frames given to later edits inside the group are relative to the final frame.

`build`, `createLayer`, and `updateLayer` take `relativeTo`, which is `parent` by default or `artboard`. With `artboard`, frame positions and path coordinates are measured from the artboard or symbol master that holds the parent, or from the page when there is none, so the origins of nested groups do not have to be added up. In `build`, `relativeTo` applies to the root nodes, and the children of a group node stay relative to that group's requested frame. In `updateLayer`, only the `x` and `y` given are converted, and a `parentId` in the same request is applied first.

The plugin reads an `image` path, an image fill's `image`, an `image` override, or an `svgFile` only when the file is inside `~/.sketch-agent-bridge/` or inside a folder in the request's `assetDirs`, and it refuses any other path. It resolves symlinks in the path and in each folder before it compares them. The server fills `assetDirs` from `SKETCH_AGENT_BRIDGE_ASSET_DIRS`, a list of absolute folders separated by `:`, so an agent cannot add a folder through `args`. If the plugin did not check the folder, an agent could read any image or SVG file on the Mac into a document and see it in a render. Photos from `fetch_images` are in `~/.sketch-agent-bridge/images/`, so they are always allowed. The server creates `~/.sketch-agent-bridge/assets/` before each request, as a folder an agent in a sandbox can be allowed to write generated files to, and it never deletes the files in it.

## Write ops

- Every write op refuses a document that has never been saved.
- Before the first write op on a document in a server session, the server runs `status` to find the document's file and copies it to `~/.sketch-agent-bridge/backups/<name>-<timestamp>.sketch`. The copy is of the file on disk, so edits made in Sketch since the last save are not in it. The server keeps the newest 10 backups of each document name and deletes older ones.
- Each write op is one step in Sketch's undo history, so Cmd+Z in Sketch undoes the whole op.
- Sketch 88.1 can stop recording a document's undo history, for manual edits as well as plugin edits, until Sketch restarts. `status` then reports `undoStuck: true` for that document, which it reads from `isMakingHistory()` on the document's history maker. The server puts a warning at the top of every write reply for that document.
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
- `colorControls`, as `{ "hue": 30, "saturation": 0.5, "brightness": 0.1, "contrast": 1.2 }`, which sets Sketch's Color Adjust on an image layer. See [Color Adjust](#color-adjust).
- `borderOptions`, with `dashPattern`, `lineEnd` (`Butt`, `Round`, `Projecting`), `lineJoin` (`Miter`, `Round`, `Bevel`), `startArrowhead`, and `endArrowhead`. Arrowheads are `None`, `OpenArrow`, `FilledArrow`, `Line`, `OpenCircle`, `FilledCircle`, `OpenSquare`, or `FilledSquare`, and they draw on open paths such as a line from an SVG.

Assigning `style.borderOptions` in Sketch's API resets every key left out to its default, so the plugin sets each key that is given and leaves the others unchanged.

### Color Adjust

Sketch's JS API has no Color Adjust, so the plugin sets it on the native `MSStyleColorControls` of the layer's style. Sketch draws Color Adjust only on image layers, and a rectangle with an image fill showed no change in a test at saturation 0, so the plugin refuses `colorControls` on any other layer type. `upsert_shared_style` builds its style on a rectangle, so it refuses `colorControls` too.

| Key          | Range       | Default | Effect                                            |
| ------------ | ----------- | ------- | ------------------------------------------------- |
| `hue`        | -180 to 180 | 0       | Rotates hue by this many degrees                  |
| `saturation` | 0 to 2      | 1       | 0 is gray and 2 doubles the saturation            |
| `brightness` | -1 to 1     | 0       | -1 is black and 1 is white                        |
| `contrast`   | 0 to 4      | 1       | Below 1 flattens the image, above 1 adds contrast |

Sketch stores hue in radians, and the plugin converts degrees to radians and back. Sketch does not clamp the stored values, so the ranges are the bridge's own limits. Keys left out of `colorControls` are reset to their defaults, and `null` turns Color Adjust off and keeps the stored values.

`textStyle` also takes `textUnderline` and `textStrikethrough`, which are `none`, `single`, `double`, or `thick`, and `fontStretch`, which is `compressed`, `condensed`, `narrow`, `expanded`, or `poster`.

`textStyle.fontAxes` sets the axes of a variable font by name, such as `{ "Weight": 700, "Width": 80 }`. The plugin refuses a font that is not variable, an axis the font does not have, and a value outside the axis range. Set `fontFamily` in the same request to switch to the font first.

### Paths

`updateLayer` takes `path` to replace the points of a shape path whose `shapeType` is `Custom`, such as a `path` layer or a shape from an SVG. The frame moves to fit the new path. Rectangles, ovals, and the other preset shapes refuse `path`. A `Shape` takes path data with any number of subpaths and replaces its parts with one shape path per subpath. A single shape path refuses path data with more than one subpath, because turning it into a `Shape` would change its id.

### Text runs

`textRuns` styles part of a text layer, such as one bold word, in `build`, `createLayer`, and `updateLayer`. Each run picks its characters with `text`, which styles the first place that text appears, or with `start` and `length`, which count characters the way JavaScript strings do, so an emoji can count as 2. A run takes `fontFamily`, `fontWeight`, `fontSize`, `fontStyle` (`italic` or `normal`), `textColor`, `textUnderline`, and `textStrikethrough`, and keys left out keep the style the characters already have. A swatch color stays linked to the swatch.

Sketch's JavaScript API styles the whole text of a layer, so the plugin writes runs to the native attributed string with `setAttributedStringValue:`. Setting `text` gives all of the new text the style of the old first character, and setting `textStyle` restyles the whole text, so the plugin applies `textRuns` after both when they come in the same request.

### Text alignment

Sketch 88.1 writes text alignment with the raw values AppKit uses on Intel Macs. On Apple Silicon, AppKit's raw values for center and right are swapped, so a layer set to `center` through Sketch's API renders right-aligned. The plugin swaps `center` and `right` on both write and read when `NSTextAlignmentCenter` is 1, which makes the alignment in requests and specs match what renders.

### Layout and order

`smartLayout` is one of `LeftToRight`, `HorizontallyCenter`, `RightToLeft`, `TopToBottom`, `VerticallyCenter`, or `BottomToTop`, and `null` turns it off. It applies to groups and symbol masters. After `setOverrides` changes an instance whose master has a smart layout, the plugin calls `resizeWithSmartLayout()` on the instance, so the instance grows or shrinks to fit its new override text.

`mask: true` makes a shape path, shape, or image a clipping mask by calling `setHasClippingMask` on the native layer, and `mask: false` turns it off. Sketch clips every layer above the mask in the same group or artboard to the mask's outline, so a mask normally sits at the back of a group, below the layers it clips. Sketch also draws the mask layer's fill, so a rectangle mask with a white fill shows as a white block under the layers it clips. A mask that should only clip needs `fills: []`. A group holding a mask is sized to the mask instead of the full size of the layers it clips. Sketch only recalculates the group's size when the group is refit, so `updateLayer` refits the parent group after it changes `mask` or `breaksMask`. `breaksMask: true` calls `setShouldBreakMaskChain`, which stops the mask from clipping that layer and the layers above it. The plugin refuses `mask: true` on any layer that is not a shape path, shape, or image.

`resizing` sets how a layer changes when its group, artboard, or symbol instance is resized. It takes `pinLeft`, `pinRight`, `pinTop`, and `pinBottom`, which keep the layer's distance to that edge, and `fixWidth` and `fixHeight`, which keep its size. Keys left out are unchanged. Sketch 88.1's JavaScript API has no resizing constraints, so the plugin calls `setHasFixedLeft:` and the other setters on the native layer. The plugin refuses a layer pinned left and right with a fixed width, and a layer pinned top and bottom with a fixed height.

`booleanOperation` is `none`, `union`, `subtract`, `intersect`, or `difference`, and sets how a part of a Shape joins the parts below it. The bottom part is the base, so with `subtract` each part above it cuts its outline out of the parts below. Sketch sizes a Shape to the result of its boolean operations, so `updateLayer` refits the Shape after it changes `booleanOperation`, and it refuses a layer whose parent is not a Shape. `combineShapes` puts shapes and paths that share a parent into a new Shape, sets every part to `operation`, and gives the Shape the name and style of the bottom layer. Sketch deleted a Shape at the end of the plugin run when the Shape got its parent and an empty `layers` list in its constructor, so the plugin creates each Shape with only the empty `layers` list and sets its parent after.

`layoutGrid` sets the column and row grid that Sketch draws over an artboard or symbol master, and `grid` sets the square grid. Both replace the whole grid, and `null` turns it off. `layoutGrid.columns` takes `count`, `gutterWidth`, and either `columnWidth` or `totalWidth`. Without either, the columns fill the artboard width. `offset` is the distance from the left edge and defaults to centering the columns, and `guttersOutside` adds half a gutter outside the first and last columns. `layoutGrid.rows` takes `gutterHeight` and `rowHeightMultiplier`, which is how many gutter heights tall each row is. `grid` takes `size` and `thickEvery`, which draws a thick line every that many cells. Sketch's layout grid setters recalculate the values that were not set, so the plugin sets the number of columns and the total width before the gutter width, and Sketch works out the column width from the number of columns, the total width, and the gutter width. Groups have no grids in Sketch 88.1, so the plugin refuses `layoutGrid` and `grid` on any layer that is not an artboard or symbol master.

`updateLayer` takes `parentId` to move a layer into another artboard, group, or page. The layer keeps its place on the canvas, and a `frame` in the same request is relative to the new parent. An artboard can only move to a page, and a layer cannot move into itself or one of its children. A group that the layer leaves or joins is resized to fit its children.

`updateLayer` takes `order`, which is `front`, `back`, `forward`, `backward`, an index in the parent where 0 is the back, or `{ "above": "<id>" }` or `{ "below": "<id>" }` to sit directly next to a sibling. The sibling must share the layer's parent.

`build` takes `order` too, which places the root nodes in the parent once they are built. It is `front`, `back`, an index where 0 is the back, or `{ "above": "<id>" }` or `{ "below": "<id>" }`. The first root goes to that place and each later root goes directly above the one before it, so the roots keep their order among themselves. The default is `front`. When the parent is a group, the group refits after the roots are placed, so a mask built with `order: "back"` sizes the group in the same call.

`duplicate` copies each layer into the same parent, directly above the original, and moves the copy by `offset`. Each copy gets the `createdByAgent` setting.

### Prototypes and export presets

`flow` is `{ "target": "<artboard id>", "animation": "slideFromLeft" }`, where `target` can also be `"back"` to return to the previous artboard, and `animation` is `none`, `slideFromRight`, `slideFromLeft`, `slideFromBottom`, or `slideFromTop`, with `slideFromRight` as the default. `null` removes the link. `flowStartPoint: true` marks an artboard as a prototype start point. A hotspot made with the `hotspot` kind carries a `flow` without drawing anything, so a prototype link can cover part of a layer or several layers at once.

`exportFormats` replaces a layer's export presets with a list of `{ "fileFormat": "png", "size": "2x", "prefix": "", "suffix": "@2x" }`. `fileFormat` is `png`, `jpg`, `tiff`, `webp`, `gif`, `pdf`, `eps`, or `svg`. `size` is a scale such as `2x`, a width such as `300w`, or a height such as `200h`, and defaults to `1x`. An empty list removes the presets.

### Pages

`createPage` adds a page at the end of the document and gives it the `createdByAgent` setting. `updatePage` renames a page, and `index` moves it in the page list, where 0 is the first page and an index past the end moves it last. Sketch's JavaScript API cannot reorder pages, so the plugin calls `removePage:` and then `insertPage:atIndex:` on the native document data. The page keeps its id and layers. `removePage:` can change which page Sketch shows, so the plugin then selects the page that was selected before the move. The reply has the page's `index` after the move. `deletePage` removes a page and every layer on it. It refuses the last page, the Symbols page unless `force` is true, and a page without the `createdByAgent` setting unless `force` is true. To switch pages, use `reveal` with a page id.

### Color space

`status` reports each document's `colorSpace`, which is `Unmanaged`, `sRGB`, or `P3`. `updateDocument` calls `document.changeColorSpace` with `colorSpace` and `convert`, and the plugin refuses `colorSpace` without `convert`. With `convert: true`, Sketch converts every color so it looks the same in the new color space. With `convert: false`, Sketch keeps the color values, so colors can look different. In a test, converting from `Unmanaged` to `P3` kept every color value, and converting back from `P3` to `Unmanaged` rewrote them, so a fill of `#e4572e` became `#f74915`. A round trip with `convert: true` does not give back the original colors. Cmd+Z in Sketch undoes a color space change.

### Saving

`save` calls `document.save()` on a document that already has a file. For a 28 MB document, Sketch 88.1 writes the file about 3 seconds after the plugin run ends, and it calls the save callback before it writes the file, so the plugin returns as soon as it asks Sketch to save. The server reads the file's modification time before the op and checks it every 250 milliseconds afterward, and it returns an error when the modification time has not changed after 30 seconds. Like every write op, `save` first makes the session's backup if the session has none yet, so the backup holds the file from before the agent saved it. The `save_document` tool's description tells the agent to call it only when the user asks to save.

### Symbols

`createSymbol` makes a new symbol master on the Symbols page from the given layers. By default it moves the layers into the master and puts an instance where they were. With `replace` set to false, it copies the layers into the master and leaves the originals in place. Its reply lists the overrides the symbol exposes, by layer name and property.

Overrides are set with a list of `{ "layer": "<layer name inside the symbol>", "value": "..." }`, or `{ "id": "<override id>", "value": "..." }`. A text layer has both a `stringValue` and a `textStyle` override, and matching by layer name picks `stringValue` unless `property` says otherwise. The value is text for `stringValue`, a symbol name for `symbolID`, an absolute image path for `image`, and a hex color or `{ "swatch": "<name>" }` for `fillColor`. A swatch stays linked, and it can come from an enabled library. When one layer has several overrides, such as the locked `symbolID` and the `fillColor` of the accent color layer in Apple's iOS switch, a color value picks `fillColor`, and any other value picks a content override that is not locked. The plugin refuses an override that the symbol master marks as not editable, which `symbols` with `includeOverrides` reports as `editable: false`. The plugin applies the changes in order, because a change to a nested symbol's `symbolID` changes which overrides the later changes can match. When a change fails, the plugin puts back the instance's override values from before the request, so the earlier changes in the list do not stay. It copies the native `overrideValues` array and its items first, because Sketch returns the live array and changes it in place.

`updateLayer` on a symbol master takes `editableOverrides`, a list of `{ "layer": "<layer name>", "property": "stringValue", "editable": false }` or `{ "id": "<override id>", "editable": false }`, which sets whether instances can change each override. Matching by layer name without `property` changes every override on that layer. The plugin sets `editable` on the master's override, which Sketch's API applies with `setOverridePoint:editable:` on the native master. It refuses `editableOverrides` on any layer that is not a symbol master, and on a master from a library until it is unlinked. It matches every entry before it changes any, so an entry that matches no override, or one with neither `id` nor `layer`, leaves the master unchanged.

`detach` replaces an instance with a group of its layers and keeps the instance's overrides. With `recursively`, nested instances are detached too. It refuses an instance without the `createdByAgent` setting unless `force` is true, and the new group gets the setting when the instance had it.

`convertSymbol` with `to: "symbol"` turns an artboard into a symbol master in the same place, with a new id. With `to: "artboard"`, a symbol master becomes an artboard with the same id, and its instances are detached into groups. The reply has `detachedInstances`. It refuses a master with instances, or one without the `createdByAgent` setting, unless `force` is true, and it refuses a library master until it is unlinked.

Variants of one component are separate masters with slash names, such as `Feature Row/Left` and `Feature Row/Right`. `updateLayer` with `symbol` swaps an instance between them.

### Token use

Write replies are sized to keep the agent's context small:

- `createArtboard`, `createLayer`, `updateLayer`, `applySharedStyle`, `groupLayers`, and `detach` return only `id`, `name`, `type`, and `frame` unless `verbose` is true. `build`, `ungroupLayer`, `createSymbol`, and `duplicate` return the same short form for each layer they report on, and they ignore `verbose`. When a layer's parent is a group or a compound shape, the short form adds `artboardFrame`, which is the layer's frame in the coordinates of its artboard, symbol master, or page. `createArtboard`, `createLayer`, `updateLayer`, `applySharedStyle`, `groupLayers`, and `detach` also add `parent` with the parent's `id`, `name`, `type`, and `artboardFrame`.
- `render` picks what the reply renders as a PNG: `none`, `layer`, or `artboard`. `build` defaults to `artboard` and renders once. The other ops that take `render` default to `layer`. `upsertSwatch`, `upsertSharedStyle`, and `deleteLayer` never render.
- PNGs render at 1x unless `scale` says otherwise.
- JSON in replies has no indentation.

## Fetching images

`fetch_images` asks the Unsplash search endpoint for the photos most relevant to the query and downloads each one as a JPEG, cropped to `width` and `height`, into a new folder under `~/.sketch-agent-bridge/images/`. The server deletes that folder after 7 days, so an agent that wants a photo later has to fetch it again. A layer made from the photo keeps the image, because Sketch stores the image data in the document. The server refuses a photo larger than 25 MB, and a download that redirects to a host other than `images.unsplash.com`. The server reads the Unsplash access key from the login keychain item with the service name `unsplash_access_key`, using `/usr/bin/security`, and falls back to the `UNSPLASH_ACCESS_KEY` environment variable when the keychain has no such item. The key goes only in the `Authorization` header of requests to `api.unsplash.com`, and the server replaces it with `<key>` in any Unsplash error text before returning the error.

`orientation` is `landscape`, `portrait`, `squarish`, or `any`, and the server picks it from the width and height when it is left out. `color` is one of the 11 colors the [Unsplash search endpoint](https://unsplash.com/documentation#search-photos) accepts, such as `blue` or `black_and_white`. When no photo matches, the server searches again without `color`, then without `orientation`, and adds a line to `warnings` for each filter it dropped.

The reply has an `images` list, where each entry has the file `path` and a `credit` with `photographer`, `profileUrl`, and `text`, such as "Photo by Annie Spratt on Unsplash". The [Unsplash API guidelines](https://help.unsplash.com/en/articles/2511245-unsplash-api-guidelines) require crediting the photographer and Unsplash with a link to the photographer's profile, and `profileUrl` carries the `utm_source` and `utm_medium` parameters that the [attribution guideline](https://help.unsplash.com/en/articles/2511315-guideline-attribution) asks for. The same API guidelines require a request to each photo's `download_location`, which the server sends after saving the photo. When the `download_location` request fails, the photo is kept, and `warnings` gets the HTTP status with the first error Unsplash sent, such as a rate limit message.

The server downloads photos only from `https://images.unsplash.com` and sends download requests only to `https://api.unsplash.com`, so a link in the Unsplash reply that points anywhere else is refused. A download also has to come back with an `image/` content type. When some downloads fail and others succeed, the reply has the photos that downloaded and a warning for each one that did not.

## Layer spec

Each layer has `id`, `name`, `type`, and `frame`. These keys appear only when they have a value:

- `children`, or `childCount` with `truncated: true` on the root when the depth limit or the 2000-layer limit cut the tree. A `Shape` made of more than 20 parts, such as an SVG path with many subpaths, always shows `childCount` instead of its parts.
- `hidden`, `locked`, `rotation`, `flippedHorizontally`, `flippedVertically`, `mask`, and `breaksMask`, which is left out for pages, artboards, and symbol masters because none of them can sit in a group with a mask, and Sketch 88.1 reported every artboard and symbol master in the test document as breaking the mask chain
- `smartLayout` for groups and symbol masters
- `resizing` with each of `pinLeft`, `pinRight`, `pinTop`, `pinBottom`, `fixWidth`, and `fixHeight` that is set
- `booleanOperation` for a part of a Shape, when it is not `none`
- `shapeType` and `cornerRadius` for shape paths, and for a `Custom` shape path, `path` as SVG path data when it is 2000 characters or shorter, and `closed: false` when the path is open. Export a longer path as SVG with `export`.
- `lines` and `overflows` for text layers when `textLines` is true, described below
- `textRuns` for text layers with more than one style, listing each run that differs from the layer's `textStyle`, which describes the first character. Each run has `text`, `start`, `length`, and the keys that differ from the first run, which can include `swatch` with the name of a linked swatch. Reading the runs of the 388 text layers in the test document took 134 milliseconds.
- `text`, `textStyle`, `fixedWidth`, and `lineSpacing` for text layers, where `lineSpacing` is left out when it is `natural`, `textStyle` has `fontAxes` for a variable font, where `alignment` is left out when it is `left` and `verticalAlignment` is left out when it is `top`
- `style` with `opacity`, `fills`, `borders`, `borderOptions`, `shadows`, `innerShadows`, `blur`, `colorControls`, and `blendingMode`. A color linked to a swatch also has `swatch`, a gradient fill is `{ "gradient": { "type", "from", "to", "stops" } }` in the same form `style` takes as input, and an image fill is `{ "image": true }`. `borderOptions` and `blendingMode` appear only when they differ from Sketch's defaults, and `colorControls` appears only when Color Adjust is turned on.
- `sharedStyle` with the shared style name, and `sharedStyleOutOfSync: true` when the layer's style no longer matches the shared style
- `symbol`, `symbolId`, and `overrides` for symbol instances, where `overrides` lists only overrides changed from the default, and a `fillColor` value is `{ "color": "#rrggbbaa" }` with `swatch` when it is linked to one
- `flow` with `target`, `targetName`, and `animation`, where `target` is `back` for a back link
- `flowStartPoint` for artboards
- `layoutGrid` with `columns` and `rows`, and `grid` with `size` and `thickEvery`, for artboards and symbol masters with a grid turned on
- `exportFormats` with `fileFormat`, `size`, and `prefix` or `suffix` when set

With `textLines`, `layer` and `selection` add `lines` to each text layer, with the `text` and `frame` of each line the text wraps into, measured from the text layer's origin. The plugin reads the lines from `fragments` on Sketch's `Text` layer. A text layer whose last line ends below its frame also gets `overflows: true`, which happens to text with a fixed size in Sketch. Auto-height text grows to fit its lines. Reading the lines of the 388 text layers in the test document took 12.5 seconds, so the lines are only read when `textLines` is true.
