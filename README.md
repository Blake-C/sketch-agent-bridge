# Sketch Agent Bridge

Sketch Agent Bridge connects Sketch 88.1 to AI agents such as Claude Code. Sketch 88.1 runs locally without a subscription and has no AI features, so this project adds a plugin and a local MCP server that let an agent read designs from the open Sketch document and make edits back into it.

## What it does

An agent connected to the MCP server can:

- see the current selection as a PNG, an SVG, and a JSON spec of its layers
- list pages and artboards, and read any layer by id
- read the document's design tokens, which are its swatches, text styles, layer styles, and symbols
- create artboards and layers, edit them, and apply shared styles
- add or change swatches and shared styles

For agents without MCP support, the plugin menu command **Plugins > Agent Bridge > Send Selection to Agent** exports the selection to a folder and copies the folder path to the clipboard, so the path can be pasted into any agent.

## How it works

The MCP server runs `sketchtool run`, the command-line tool that ships inside Sketch, to call a command in the plugin. The plugin runs inside Sketch, does the work, and writes its reply and exports to `~/.sketch-agent-bridge/`.

## Safety

- New layers go on a page named "Agent Drafts" unless the agent names another parent.
- Before the first edit in a session, the server copies the `.sketch` file to `~/.sketch-agent-bridge/backups/`.
- The agent can only delete layers it created, unless it passes `force: true`.
- Everything stays on the Mac. Nothing is sent to a network service by the bridge.

## License

GPL 3.0. See [LICENSE](LICENSE).
