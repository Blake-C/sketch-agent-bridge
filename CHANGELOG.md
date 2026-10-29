# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- Added `textStyle` to `build_layers` and to its group and artboard nodes, which sets default text style keys for the text nodes inside them.
- Added `copyOf` to `build_layers` nodes, which copies an earlier node in the same call by its `ref` and applies the fields given on the copy.
- Added `region` to `export_layers`, which crops each PNG to a rectangle measured from the layer's top-left corner.
- Added `summary` to `get_layer`, which returns only the id, name, type, frame, `hidden`, and text of each layer, and `childCount` where `depth` stops.
- Added a test that fails when `tools/list` grows past 80,000 characters.
- Added an `install_google_font` tool, which downloads a family from Google Fonts into `~/Library/Fonts` as static TrueType files, registers them so Sketch can use them without a restart, and adds the family to a "Google Fonts" collection in Font Book.
- Added a `list_fonts` tool, which lists the installed font families, the families in the "Google Fonts" collection, and each face's style and weight on the Sketch scale.
- Added a `find_overlaps` tool, which lists the text layers in an artboard or group that another visible layer crosses, testing shapes against their outlines and skipping layers that hold the whole text or are hidden behind one that does.
- Added an `update_layers` tool, which applies several `update_layer` changes in one plugin run and renders once.
- Added `svg` and `svgFile` to `update_layer`, which replace the drawing of an SVG layer an agent created and keep its name, place in the layer list, and style.
- Added `~/.sketch-agent-bridge/assets/`, which the server creates before each request so a sandboxed agent can be allowed to write generated files there.
- Added `colorControls` to `style`, which sets Sketch's Color Adjust (hue, saturation, brightness, and contrast) on an image layer, and to the layer spec when it is turned on.
- Added `order` to `build_layers`, which places the new root layers at the back, at an index, or next to a sibling, so a mask can be added to the back of an existing group in one call.
- Added `editableOverrides` to `update_layer`, which sets whether instances of a symbol master can change each override.
- Added `colorSpace` to `sketch_status`, and an `update_document` tool that changes the document's color space.
- Added the `json` format, `trimmed`, and `background` to `export_layers`.
- Added `index` to `update_page`, which moves a page in the page list.
- Added a `slice` layer kind to `build_layers` and `create_layer`, which marks an area of the canvas to export.
- Added a `save_document` tool, which saves the document to its file and waits until Sketch has written it.
- Added `parentId` and `locked` to `update_layer`, so a layer can move into another artboard, group, or page and keep its place on the canvas.
- Added a `select_layers` tool.
- Added `create_page`, `update_page`, and `delete_page` tools.
- Added triangle, polygon, star, and path layer kinds, and `path` in `update_layer` and layer specs.
- Added `lineSpacing` for text layers, and `fontStretch` and variable font axes to `textStyle`.
- Added a `convert_symbol` tool that turns artboards into symbol masters and back.
- Added a `sync_library_item` tool that syncs or unlinks library symbols and shared styles.
- Added an `update_library` tool that adds a library or turns one on or off, and `includeDisabled` in `list_libraries`.
- Added `sharedStyleOutOfSync` to layer specs.
- Added a warning on write replies when Sketch has stopped recording undo history for the document, and `undoStuck` in `sketch_status`.
- Added `{ above: id }` and `{ below: id }` to `order` in `update_layer`, so a layer can be placed directly next to a sibling without knowing its index.
- Added `groups` to the `build_layers` reply, which lists every group the build created with its final frame. A group shrinks to fit its children, so its origin can differ from the origin of the requested frame, and later frames inside it are relative to the new origin.
- Added `relativeTo` to `build_layers`, `create_layer`, and `update_layer`. With `"artboard"`, frame positions and path coordinates are measured from the artboard, so the origins of nested groups do not have to be added up.
- Added `artboardFrame` to layer summaries when the parent is a group or compound shape, and `parent` with the parent's `artboardFrame` to the replies of `create_artboard`, `create_layer`, `update_layer`, `apply_shared_style`, `group_layers`, and `detach`.
- Added `svgFile` on svg layers to load a drawing from a `.svg` file.
- Added `mask` and `breaksMask` to `build_layers`, `create_layer`, `update_layer`, and layer specs, so a shape or image can clip the layers above it in its group.
- Added `warnings` to plugin replies, shown at the top of the tool result. Setting `fontFamily` or `fontWeight` warns when Sketch used a different font because the family is not installed or has no face at that weight, and lists the weights the family has.
- Added `resizing` to `build_layers`, `create_layer`, `update_layer`, and layer specs, which pins a layer to the edges of its parent and fixes its width or height, for when its group, artboard, or symbol instance is resized.
- Added a `combine_shapes` tool, a `shape` node kind in `build_layers`, and `booleanOperation` on the parts of a combined shape in `build_layers`, `update_layer`, and layer specs.
- Added `textRuns` to `build_layers`, `create_layer`, `update_layer`, and layer specs, which styles part of a text layer with its own font, weight, size, italic, color, underline, or strikethrough.
- Added `textLines` to `get_layer` and `get_selection`, which returns each line a text layer wraps into and `overflows: true` when the text runs past the bottom of its frame.
- Added `layoutGrid` and `grid` to `build_layers`, `create_layer`, `update_layer`, and layer specs, which set the column, row, and square grids on artboards and symbol masters.
- Added a `hotspot` layer kind to `build_layers` and `create_layer`, which makes an invisible clickable area with a prototype link.
- Added `sharedStyle` and `swatch` to `find_layers`, which find the layers linked to a shared style or using a swatch.
- Added `orientation` and `color` to `fetch_images`, and `warnings` to its reply for a filter that `get_images` dropped because no photo matched it.
- Added a `pnpm check` script that runs lint, typecheck, and test.
- Added a GitHub Actions workflow that runs lint, typecheck, tests, the build, and gitleaks, and a Dependabot config for npm packages, Actions, and the Docker image.
- Added tests that fail when the server sends an op the plugin does not have, or when an op or tool is missing from `docs/protocol.md`.

### Changed

- Changed the color, fill, shadow, style, text style, and text run schemas to appear once in each tool's `definitions` and be referenced with `$ref`. This change and the removal of `create_layer` and `update_layer` cut `tools/list` from 115,945 to 77,541 characters.
- Changed the `build_layers` reply to leave root layers out of `groups`, because `roots` already lists them with their final frames.
- Changed the `mask` description to say that Sketch draws the mask's fill, so a mask that should only clip needs `fills: []`.
- Changed the Docker setup to pin the Node and gitleaks images by digest, run as the `node` user with every Linux capability dropped, and add an `offline` service with no network for build, test, lint, and format.
- Changed `fetch_images` to refuse a photo larger than 25 MB, and a download that redirects away from `images.unsplash.com`.
- Changed the plugin to read image and SVG files only from `~/.sketch-agent-bridge/` and the folders in the new `SKETCH_AGENT_BRIDGE_ASSET_DIRS` variable. Before, an agent could read any image or SVG file on the Mac into a document.
- Changed the server to delete folders in `images/` and `inbox/` older than 7 days, and to keep only the newest 10 backups of each document. Before, `images/`, `inbox/`, and `backups/` grew without limit.
- Changed the plugin to create folders with mode 0700 and write files with mode 0600, and the server to set `~/.sketch-agent-bridge` to 0700 on each request. Before, other users on the Mac could read the folders that Send Selection made.
- Changed the server to write each request to `request.json` in the request folder and pass only the folder path to `sketchtool`. Other users on the Mac could read the request, including layer text, in the process list, and a large request could go over the system's limit on argument size.
- Changed `fetch_images` to call the Unsplash API from the server, so it no longer needs the `get_images` shell function or `SKETCH_AGENT_BRIDGE_GET_IMAGES`. The key comes from the `unsplash_access_key` keychain item or `UNSPLASH_ACCESS_KEY`. Each entry in `images` is now an object with `path` and a `credit` for the photographer. The server sends Unsplash the download request its API guidelines require. A failed download leaves out that photo with a warning instead of failing the whole call, and the reply warns when Unsplash returns fewer photos than `count`. Errors and warnings include the text Unsplash sent with a failed request.
- Changed svg layers given only a width or only a height to keep the viewBox's aspect ratio.
- Changed gradient fills in `get_layer` and `get_design_tokens` to `{ "gradient": { "type", "from", "to", "stops" } }`, the same form `style` takes as input. The start and end points were missing before, so a gradient's direction could only be checked by exporting it.

### Removed

- Removed the `create_layer` and `update_layer` tools and the `createLayer` and `updateLayer` ops. `build_layers` with one node and `update_layers` with one entry do the same work, and each of the two tools repeated the whole layer schema in `tools/list`.

### Fixed

- Fixed exported PNG names, which showed a different scale than the one used, such as `@1x` for an export at 1.5. Each PNG is now named with the scale that was asked for.
- Fixed `fetch_images` reporting a dropped filter as the reason it failed. `get_images` prints its `Warning:` lines before the line that says no photos matched, and the error kept only the first line. The error now skips the warnings.
- Fixed path layers keeping only the first subpath of path data with several movetos, which turned five grid lines into one. Path data with several subpaths now becomes a compound shape with one part per subpath, and `update_layer` can replace the parts of that shape.
- Fixed `build_layers` placing layers in the wrong spot when a group held a text layer with a `textStyle`. Sketch refit the group as soon as the text changed size, and every layer built after it was offset by the group's new origin.
- Fixed SVG layers shifting up and to the left when the drawing did not fill its viewBox. The drawing now sits where it does in the viewBox.
- Fixed layer specs reporting `breaksMask: true` on artboards and symbol masters. Sketch 88.1 set the native flag on every artboard and symbol master in the test document, and they cannot sit in a group with a mask, so the spec now leaves `breaksMask` out for pages, artboards, and symbol masters.
- Fixed `get_layer` returning the points of every part of a compound shape, which reached about 95,000 characters for a dotted map. A shape with more than 20 parts now reports `childCount` instead.
- Fixed the server and plugin reporting version 0.2.0. The server now reads its version from `package.json`, and a test checks that the plugin manifest matches it.

## [0.3.0] - 2026-10-27

### Added

- Added Smart Layout on groups and symbol masters, and instances that resize to fit after an override change.
- Added a `duplicate_layer` tool.
- Added a `find_layers` tool that searches by type, name, text, or symbol, and a `list_symbols` tool with instance counts.
- Added rotation, flips, and stacking order to `update_layer` and layer nodes.
- Added inner shadows, blur, blend modes, and border dashes, line caps, joins, and arrowheads to `style`.
- Added underline and strikethrough to `textStyle`, and a `fixedWidth` setting for text layers.
- Added a `list_libraries` tool with `search`, `kind`, and `limit` filters, and symbols, shared styles, and swatches from enabled libraries are imported when a write op names them.
- Added prototype links, flow start points, and export presets to `update_layer` and layer nodes.
- Added a `detach_symbol` tool and a `reveal_layer` tool.
- Added `fillColor` overrides, set with a hex color or a swatch.

### Fixed

- Fixed agents being able to change overrides that the symbol master marks as not editable.
- Fixed `build_layers` and `create_layer` renders showing symbol instances before their overrides and Smart Layout resize, and leaving out symbols just imported from a library.
- Fixed `update_layer` renders leaving out a symbol that a swap just imported from a library.
- Fixed library text styles linking to a text layer without changing its font.

## [0.2.0] - 2026-10-27

### Added

- Added a `build_layers` tool that creates a whole tree of layers in one call and renders once at the end.
- Added groups, with `group_layers` and `ungroup_layer` tools and group nodes in `build_layers`.
- Added symbol creation with `create_symbol`, symbol swapping in `update_layer`, and overrides set by layer name.
- Added SVG layers, image layers, gradient fills, and image fills.
- Added a `fetch_images` tool that downloads Unsplash photos through the `get_images` shell function.
- Added a `render` option to write tools, and a `verbose` option for full layer specs.
- Added deleting several layers in one `delete_layer` call.

### Changed

- Changed write tools to return only id, name, type, and frame by default.
- Changed tool replies to compact JSON, and default renders to 1x.

### Fixed

- Fixed center and right text alignment being swapped on Apple Silicon Macs.
- Fixed renders after an override change showing the instance's previous overrides.
- Fixed artboard fills not drawing, by setting the artboard's background color.
- Fixed overrides set by layer name sometimes picking the text style instead of the text.
- Fixed `fetch_images` errors returning the whole Unsplash response.

## [0.1.0] - 2026-10-27

### Added

- Added a Sketch 88.1 plugin that runs bridge requests inside Sketch.
- Added a **Send Selection to Agent** menu command that exports the selection as PNG, SVG, and a JSON spec, and copies the folder path to the clipboard.
- Added an MCP server with read tools for the current selection, pages, artboards, layers, exports, design tokens, and the inbox.
- Added MCP write tools to create artboards and layers, edit layers, apply shared styles, add or change swatches and shared styles, and delete agent-created layers.
- Added a backup of the `.sketch` file before the first edit in each server session.
