# Sketch Agent Bridge

Sketch Agent Bridge is a Sketch 88.1 plugin and a local MCP server that let AI agents read designs from the open Sketch document and edit it.

## Layout

- `plugin/sketch-agent-bridge.sketchplugin/` is the Sketch plugin, written in plain CommonJS that Sketch runs in JavaScriptCore with `require('sketch')`. There is no build step, so it cannot import npm packages.
- `server/src/` is the MCP server in TypeScript. esbuild bundles it to `server/dist/server.js`, which the host runs with its own Node because the server calls the host's `sketchtool`.
- `server/test/` holds `node:test` tests.
- `docs/protocol.md` describes every op the plugin handles and the reply format. Update it whenever an op or tool changes.

## How a request flows

1. The server makes `~/.sketch-agent-bridge/requests/<uuid>/`.
2. The server runs `/Applications/Sketch.app/Contents/MacOS/sketchtool run <plugin> bridge --context=<json> --without-activating` with `execFile`, never through a shell.
3. The plugin does the op and writes `reply.json` and any exports into that folder.
4. The server reads the reply and returns it to the agent. Request folders older than 24 hours are deleted at the start of the next request.

The plugin refuses any `replyDir` outside `~/.sketch-agent-bridge/`. Write ops refuse unsaved documents, and the server backs up the `.sketch` file before the first write in a session.

## Accessing pnpm / npm / node

No package manager that manages JavaScript dependencies should ever be run on the local host machine. Always create a Dockerfile for any given project and tooling that is needed for that project, and initialize and execute PNPM, NPM, YARN, or any package manager tooling inside that container. This is done to keep the host machine safe.

These commands all run through Docker:

- `docker compose run --rm dev pnpm install`
- `docker compose run --rm dev pnpm build`
- `docker compose run --rm dev pnpm test`
- `docker compose run --rm dev pnpm lint`
- `docker compose run --rm dev pnpm format`
- `docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest git /repo`

Docker's socket is blocked by the Claude Code sandbox, so Docker commands need the sandbox turned off for that one command.

## Testing against Sketch

The Claude Code sandbox blocks `sketchtool` and Apple Events, so a live check against Sketch needs the sandbox turned off for that one command, or Blake runs it from `docs/install.md`. Test against a copy of the design system file, never the original.

## Dev ports

Block 24220 to 24229 is reserved in `digitalblake-system-setup/notes/dev-ports.md`. The server uses stdio and needs no port.
