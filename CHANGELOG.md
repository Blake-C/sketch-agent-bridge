# Changelog

All notable changes to this project will be documented in this file.

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

## [0.1.0] - 2026-10-27

### Added

- Added a Sketch 88.1 plugin that runs bridge requests inside Sketch.
- Added a **Send Selection to Agent** menu command that exports the selection as PNG, SVG, and a JSON spec, and copies the folder path to the clipboard.
- Added an MCP server with read tools for the current selection, pages, artboards, layers, exports, design tokens, and the inbox.
- Added MCP write tools to create artboards and layers, edit layers, apply shared styles, add or change swatches and shared styles, and delete agent-created layers.
- Added a backup of the `.sketch` file before the first edit in each server session.
