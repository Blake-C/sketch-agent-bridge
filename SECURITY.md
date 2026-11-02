# Security policy

## Reporting a vulnerability

Report a vulnerability privately on GitHub. Open the **Security and quality** tab of this repository and click **Report a vulnerability**. Please do not open a public issue for a security problem.

Include the version, the steps to reproduce the problem, and what an attacker could do with it.

## Supported versions

Only the latest release gets security fixes.

## Scope

Sketch Agent Bridge runs on your Mac and is used by AI agents to read and edit the open Sketch document. These count as security problems:

- The plugin reading or writing outside `~/.sketch-agent-bridge/`, or outside the asset folders set in `SKETCH_AGENT_BRIDGE_ASSET_DIRS`.
- The server running a command through a shell, or a request making it run any program besides `sketchtool`, `pgrep` to check whether Sketch is open, and `security` to read the Unsplash key from the Keychain.
- A write op changing an unsaved document, or changing a document without a backup being made first.
- A secret, such as an API key, appearing in a reply, an error, or a log.
- A dependency or build step that runs code it should not, given the pnpm settings in `pnpm-workspace.yaml`.

Text inside a Sketch document that tries to give an agent instructions is a risk of using any AI agent with untrusted files. It is not a vulnerability in this project unless the bridge itself does something unsafe because of it.
