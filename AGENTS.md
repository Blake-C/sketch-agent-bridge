# Sketch Agent Bridge

Sketch Agent Bridge is a Sketch 88.1 plugin and a local MCP server that let AI agents read designs from the open Sketch document and edit it.

## Layout

- `plugin/sketch-agent-bridge.sketchplugin/` is the Sketch plugin, written in plain CommonJS that Sketch runs in JavaScriptCore with `require('sketch')`. There is no build step, so it cannot import npm packages.
- `server/src/` is the MCP server in TypeScript. esbuild bundles it to `server/dist/server.js`, which the host runs with its own Node because the server calls the host's `sketchtool`.
- `server/test/` holds `node:test` tests.
- `docs/protocol.md` describes every op the plugin handles and the reply format. Update it whenever an op or tool changes.

## How a request flows

1. The server makes `~/.sketch-agent-bridge/requests/<uuid>/` and writes the op, its args, and the allowed asset folders to `request.json` in it.
2. The server runs `/Applications/Sketch.app/Contents/MacOS/sketchtool run <plugin> bridge --context='{"requestDir":"<dir>"}' --without-activating` with `execFile`, never through a shell.
3. The plugin does the op and writes `reply.json` and any exports into that folder.
4. The server reads the reply and returns it to the agent. At the start of each request, the server deletes request folders older than 24 hours, and photo folders and inbox items older than 7 days.

The plugin refuses any `requestDir` outside `~/.sketch-agent-bridge/`. Write ops refuse unsaved documents, and the server backs up the `.sketch` file before the first write in a session.

## Accessing pnpm / npm / node

No package manager that manages JavaScript dependencies should ever be run on the local host machine. Always create a Dockerfile for any given project and tooling that is needed for that project, and initialize and execute PNPM, NPM, YARN, or any package manager tooling inside that container. This is done to keep the host machine safe.

These commands all run through Docker. Only `pnpm install` uses the `dev` service, which has network access. The `offline` service has no network, so a build or test step cannot download or send anything. Both run as the `node` user with every Linux capability dropped.

- `docker compose run --rm dev pnpm install`
- `docker compose run --rm offline pnpm build`
- `docker compose run --rm offline pnpm test`
- `docker compose run --rm offline pnpm lint`
- `docker compose run --rm offline pnpm check`, which runs lint, typecheck, and test
- `docker compose run --rm offline pnpm format`
- `docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:v8.30.1@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f git /repo`

GitHub Actions runs `pnpm check`, `pnpm build`, and gitleaks on each push to `main` and each pull request, from `.github/workflows/ci.yml`. Dependabot opens weekly pull requests for npm packages, Actions, and the Docker base image, and waits 7 days after a release, which matches `minimumReleaseAge` in `pnpm-workspace.yaml`. Actions and images are pinned to a commit SHA or digest, with the version in a comment or tag.

Docker's socket is blocked by the Claude Code sandbox, so Docker commands need the sandbox turned off for that one command.

## Testing against Sketch

The Claude Code sandbox blocks `sketchtool` and Apple Events, so a live check against Sketch needs the sandbox turned off for that one command, or Blake runs it from `docs/install.md`. Test against a copy of the design system file, never the original.

## Dev ports

Block 24220 to 24229 is reserved in `digitalblake-system-setup/notes/dev-ports.md`. The server uses stdio and needs no port.
