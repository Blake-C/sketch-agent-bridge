# Installing and testing

## Requirements

- Sketch 88.1 at `/Applications/Sketch.app`
- Node 24 or later on the Mac, to run the built server
- Docker, to install dependencies and build

## Build the server

```sh
docker compose run --rm dev pnpm install
docker compose run --rm offline pnpm build
```

The `dev` service has network access for `pnpm install`, and the `offline` service has none. Both run as the `node` user, which cannot write to a `node_modules` volume that an earlier version of the image filled as root, so `pnpm install` fails with `EACCES` until the volume is removed with `docker volume rm sketch-agent-bridge_node_modules`.

This writes `server/dist/server.js`, which has to be rebuilt after any change in `server/src/`. Changes to the plugin need no build.

## Install the plugin menu command

The MCP server runs the plugin from this repo, so this step is only needed for **Plugins > Agent Bridge > Send Selection to Agent**:

```sh
ln -s "$PWD/plugin/sketch-agent-bridge.sketchplugin" \
	"$HOME/Library/Application Support/com.bohemiancoding.sketch3/Plugins/sketch-agent-bridge.sketchplugin"
```

Restart Sketch after linking. The command's shortcut is Ctrl+Shift+A.

## Connect an agent

Add the server to Claude Code with this command:

```sh
claude mcp add --scope user sketch -- node "$PWD/server/dist/server.js"
```

To let the agent fetch photos from Unsplash, create an app at [unsplash.com/developers](https://unsplash.com/developers) and add its access key to the login keychain:

```sh
security add-generic-password -a "$USER" -s unsplash_access_key -w
```

The command asks for the key, so the key doesn't end up in the shell history. The server can also read the key from an environment variable, but Claude Code then stores the key as plain text in its config file:

```sh
claude mcp add --scope user sketch -e UNSPLASH_ACCESS_KEY=<key> -- node "$PWD/server/dist/server.js"
```

If the server is already registered, run `claude mcp remove --scope user sketch` first. After rebuilding the server, reconnect it from `/mcp` in Claude Code or start a new session, so the new build is the one running.

By default, the plugin only reads image and SVG files inside `~/.sketch-agent-bridge/`, which holds the photos from `fetch_images`. To let the agent place files from other folders, list them in `SKETCH_AGENT_BRIDGE_ASSET_DIRS` with a `:` between them.

```sh
claude mcp add --scope user sketch -e SKETCH_AGENT_BRIDGE_ASSET_DIRS="$HOME/Design/Assets:$HOME/Downloads" -- node "$PWD/server/dist/server.js"
```

Other MCP clients take the same command in their own config format:

```json
{ "mcpServers": { "sketch": { "command": "node", "args": ["/absolute/path/to/server/dist/server.js"] } } }
```

## Check the bridge by hand

With Sketch open, this runs the `status` op and prints the reply:

```sh
D="$HOME/.sketch-agent-bridge/requests/manual-status"; mkdir -p -m 700 "$D"
echo '{"op":"status","args":{}}' > "$D/request.json"
/Applications/Sketch.app/Contents/MacOS/sketchtool run "$PWD/plugin/sketch-agent-bridge.sketchplugin" bridge --context="{\"requestDir\":\"$D\"}" --without-activating
cat "$D/reply.json"
```

## Test with an agent

Open a saved copy of the design system file in Sketch.

1. Ask the agent to describe the current selection. It should call `get_selection` and show the PNG.
2. Ask it to list the text styles and swatches. It should call `get_design_tokens`.
3. Ask it to make a button on a new artboard using an existing text style and swatch. The artboard should appear on the "Agent Drafts" page, and `~/.sketch-agent-bridge/backups/` should hold a copy of the file.
4. Press Cmd+Z in Sketch and check that the last change is undone.
