# Sketch Agent Bridge

Sketch Agent Bridge connects Sketch 88.1 to AI agents such as Claude Code. Sketch 88.1 runs locally without a subscription and has no AI features, so this project adds a plugin and a local MCP server that let an agent read designs from the open Sketch document and edit it.

## What it does

An agent connected to the MCP server can:

- see the current selection as a PNG, an SVG, and a JSON spec of its layers
- list pages and artboards, and read any layer by id
- find layers by type, name, text, or symbol, and list symbols with how many instances use each one
- read the document's design tokens, which are its swatches, text styles, layer styles, and symbols
- build a whole tree of artboards, groups, shapes, text, SVG drawings, and images in one call
- edit layers, move them into other artboards, groups, or pages, lock them, group and ungroup them, and apply shared styles
- duplicate layers, change their stacking order, rotate and flip them, and set Smart Layout on groups and symbols
- turn layers into symbols, place instances, set their overrides, swap them between symbols, and detach them
- use symbols, shared styles, and swatches from enabled libraries by name
- link layers to artboards for prototypes, and add export presets
- switch Sketch to a layer's page, select layers, and scroll the canvas to a layer
- fill layers with colors, gradients, or images, and add inner shadows, blurs, blend modes, dashed borders, and arrowheads
- add or change swatches and shared styles
- download random Unsplash photos that match a query, through a local shell function, for use as image layers and fills

For agents without MCP support, the plugin menu command **Plugins > Agent Bridge > Send Selection to Agent** exports the selection to a folder and copies the folder path to the clipboard, so the path can be pasted into any agent.

## How it works

The MCP server runs `sketchtool run`, the command-line tool that comes with Sketch, to call a command in the plugin. The plugin runs the command inside Sketch and writes its reply and exports to `~/.sketch-agent-bridge/`.

## Setup

Build the server in Docker, connect it to an agent, and optionally link the plugin into Sketch for the menu command. The steps are in [docs/install.md](docs/install.md), and the request and reply format is in [docs/protocol.md](docs/protocol.md).

## Safety

- New layers go on a page named "Agent Drafts" unless the agent names another parent.
- Before the first edit in a session, the server copies the `.sketch` file to `~/.sketch-agent-bridge/backups/`.
- The agent can only delete or detach layers it created, unless it passes `force: true`.
- The bridge makes no network calls except through `fetch_images`, which runs the `get_images` shell function to download Unsplash photos. That function reads its key from the login keychain, and the server never reads the key.
- Every file the bridge writes stays under `~/.sketch-agent-bridge/` on the Mac.

## License

GPL 3.0. See [LICENSE](LICENSE).
