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

## Ops

Every op takes an optional `documentId`. Without it, the op uses the front document.

| Op                  | MCP tool              | Args                                                                                                       |
| ------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------- |
| `status`            | `sketch_status`       | none                                                                                                       |
| `pages`             | `list_pages`          | none                                                                                                       |
| `artboards`         | `list_artboards`      | `pageId`                                                                                                   |
| `layer`             | `get_layer`           | `id`, `depth`, `includeHidden`                                                                             |
| `selection`         | `get_selection`       | `depth`, `includeHidden`, `scale`, `svg`, `export`                                                         |
| `export`            | `export_layers`       | `ids`, `formats`, `scale`                                                                                  |
| `tokens`            | `get_design_tokens`   | none                                                                                                       |
| `createArtboard`    | `create_artboard`     | `pageId`, `name`, `x`, `y`, `width`, `height`, `style`                                                     |
| `createLayer`       | `create_layer`        | `parentId`, `kind`, `name`, `frame`, `cornerRadius`, `text`, `symbol`, `sharedStyle`, `style`, `textStyle` |
| `updateLayer`       | `update_layer`        | `id`, `name`, `hidden`, `frame`, `text`, `cornerRadius`, `overrides`, `style`, `textStyle`                 |
| `applySharedStyle`  | `apply_shared_style`  | `id`, `sharedStyle`                                                                                        |
| `upsertSwatch`      | `upsert_swatch`       | `name`, `color`                                                                                            |
| `upsertSharedStyle` | `upsert_shared_style` | `kind`, `name`, `fromLayerId`, `style`, `textStyle`                                                        |
| `deleteLayer`       | `delete_layer`        | `id`, `force`                                                                                              |

`list_inbox` and `get_inbox_item` read `~/.sketch-agent-bridge/inbox/` directly and do not call the plugin.

## Write ops

- Every write op refuses a document that has never been saved.
- Before the first write op on a document in a server session, the server runs `status` to find the document's file and copies it to `~/.sketch-agent-bridge/backups/<name>-<timestamp>.sketch`. The copy is of the file on disk, so edits made in Sketch since the last save are not in it.
- Colors are a hex string (`#rrggbb` or `#rrggbbaa`) or `{ "swatch": "<name or id>" }`. A swatch color stays linked to the swatch.
- Layers created by a write op get the layer setting `createdByAgent`, which `deleteLayer` checks unless `force` is true.
- `createLayer`, `createArtboard`, `updateLayer`, and `applySharedStyle` return the layer's spec and a 1x PNG of its artboard.

## Layer spec

Each layer has `id`, `name`, `type`, and `frame`. These keys appear only when they have a value:

- `children`, or `childCount` with `truncated: true` on the root when the depth limit or the 2000-layer limit cut the tree
- `hidden`, `locked`, `rotation`
- `shapeType` and `cornerRadius` for shape paths
- `text` and `textStyle` for text layers
- `style` with `opacity`, `fills`, `borders`, `shadows`, `innerShadows`, and `blur`, where a color linked to a swatch also has `swatch`
- `sharedStyle` with the shared style name
- `symbol`, `symbolId`, and `overrides` for symbol instances, where `overrides` lists only overrides changed from the default
