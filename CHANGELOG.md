# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

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
- Added `mask` and `breaksMask` to `build_layers`, `create_layer`, `update_layer`, and layer specs, so a shape or image can clip the layers above it in its group.
- Added `warnings` to plugin replies, shown at the top of the tool result. Setting `fontFamily` or `fontWeight` warns when Sketch used a different font because the family is not installed or has no face at that weight, and lists the weights the family has.
- Added `orientation` and `color` to `fetch_images`, and `warnings` to its reply for a filter that `get_images` dropped because no photo matched it.

### Changed

- Changed gradient fills in `get_layer` and `get_design_tokens` to `{ "gradient": { "type", "from", "to", "stops" } }`, the same form `style` takes as input. The start and end points were missing before, so a gradient's direction could only be checked by exporting it.

### Fixed

- Fixed `fetch_images` reporting a dropped filter as the reason it failed. `get_images` prints its `Warning:` lines before the line that says no photos matched, and the error kept only the first line. The error now skips the warnings.
- Fixed path layers keeping only the first subpath of path data with several movetos, which turned five grid lines into one. Path data with several subpaths now becomes a compound shape with one part per subpath, and `update_layer` can replace the parts of that shape.
- Fixed `build_layers` placing layers in the wrong spot when a group held a text layer with a `textStyle`. Sketch refit the group as soon as the text changed size, and every layer built after it was offset by the group's new origin.
- Fixed SVG layers shifting up and to the left when the drawing did not fill its viewBox. The drawing now sits where it does in the viewBox.
- Fixed `get_layer` returning the points of every part of a compound shape, which reached about 95,000 characters for a dotted map. A shape with more than 20 parts now reports `childCount` instead.

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
