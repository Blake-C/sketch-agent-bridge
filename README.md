# Sketch Agent Bridge

Sketch Agent Bridge connects Sketch 88.1 to AI agents such as Claude Code. Sketch 88.1 runs locally without a subscription and has no AI features, so this project adds a plugin and a local MCP server that let an agent read designs from the open Sketch document and edit it.

## What it does

An agent connected to the MCP server can:

- see the current selection as a PNG, an SVG, and a JSON spec of its layers
- list pages and artboards, and read any layer by id
- add, rename, reorder, and delete pages
- find layers by type, name, text, symbol, shared style, or swatch, and list symbols with how many instances use each one
- read the document's design tokens, which are its swatches, text styles, layer styles, and symbols
- build a whole tree of artboards, groups, shapes, paths, text, SVG drawings, and images in one call
- edit the points of a path, and set line spacing and variable font axes on text
- style part of a text layer, such as one bold or colored word
- read the lines a text layer wraps into, and whether the text overflows its frame
- edit layers, move them into other artboards, groups, or pages, lock them, group and ungroup them, and apply shared styles
- duplicate layers, change their stacking order, rotate and flip them, and set Smart Layout on groups and symbols
- use a shape or image as a clipping mask for the layers above it in its group
- combine shapes with union, subtract, intersect, and difference
- pin layers to the edges of their group, artboard, or symbol and fix their width or height, which sets how they change when a symbol instance is resized
- turn layers into symbols, place instances, set their overrides, swap them between symbols, and detach them
- turn artboards into symbols and back, and see which layers no longer match their shared style
- use symbols, shared styles, and swatches from enabled libraries by name, sync or unlink them, and add libraries or turn them on and off
- link layers and hotspots to artboards for prototypes, add export presets, and add slices
- set the column, row, and square grids on artboards and symbol masters
- switch Sketch to a layer's page, select layers, and scroll the canvas to a layer
- fill layers with colors, gradients, or images, and add inner shadows, blurs, blend modes, dashed borders, and arrowheads
- add or change swatches and shared styles
- save the document when asked to
- download the Unsplash photos most relevant to a query, filtered by orientation or color, through a local shell function, for use as image layers and fills
- use the textures and leaf drawings in `assets/`, which `list_assets` lists with their paths

For agents without MCP support, the plugin menu command **Plugins > Agent Bridge > Send Selection to Agent** exports the selection to a folder and copies the folder path to the clipboard, so the path can be pasted into any agent.

## How it works

The MCP server runs `sketchtool run`, the command-line tool that comes with Sketch, to call a command in the plugin. The plugin runs the command inside Sketch and writes its reply and exports to `~/.sketch-agent-bridge/`.

## Setup

Build the server in Docker, connect it to an agent, and optionally link the plugin into Sketch for the menu command. The steps are in [docs/install.md](docs/install.md), and the request and reply format is in [docs/protocol.md](docs/protocol.md).

## Safety

- New layers go on a page named "Agent Drafts" unless the agent names another parent.
- Before the first edit in a session, the server copies the `.sketch` file to `~/.sketch-agent-bridge/backups/`.
- Each edit is one step in Sketch's undo history. If Sketch stops recording undo history for the document, every edit reply starts with a warning until Sketch restarts.
- The agent can only delete or detach layers, delete pages, or turn symbol masters into artboards when it created them, unless it passes `force: true`.
- `update_library` changes Sketch's library list for every document, outside the backup and Cmd+Z, and it can add or turn off a library but not remove one.
- The bridge makes no network calls except through `fetch_images`, which runs the `get_images` shell function to download Unsplash photos. That function reads its key from the login keychain, and the server never reads the key.
- Every file the bridge writes stays under `~/.sketch-agent-bridge/` on the Mac.

## License

GPL 3.0. See [LICENSE](LICENSE).
