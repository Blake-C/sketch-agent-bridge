# Guardrail Options

This document describes potential guardrails that can be placed on a particular project depending on what tools are being used; not rules or requirements.

## Styling

Styling guardrails should include Prettier and Stylelint. Prettier used for formatting and Stylelint to make sure it's kept consistent.

https://stylelint.io/
https://prettier.io/

## JavaScript

If the project uses JavaScript, integrate eslint so that we have a tool to statically analyze our code.

https://eslint.org/

## Security

Snyk - We should run Snyk on any potential projects where security is a pivotal point that needs to be considered, especially if it's something being launched into a production environment. There should be a Snyk MCP server running that can be utilized to run this locally without needing to rely on the web interface.

https://snyk.io/articles/snyk-mcp-cheat-sheet/

zricethezav/gitleaks - Use Gitleaks as a SAST tool for detecting hardcoded secrets like passwords, api keys, and tokens in git repos.

https://hub.docker.com/r/zricethezav/gitleaks

docker containers - always be sure to run tooling inside of a Docker container set up for that particular project. Do not install node modules directly on the host machine, especially without hardening first.

https://docs.docker.com/dhi/explore/security-concepts/hardening/

pnpm - PNPM should be used over npm. When setting up PNPM, we should go through all the supply chain hardening lists to ensure that everything we need flagged and toggled on to ensure maximum security is done so.

https://pnpm.io/supply-chain-security

## Testing

playwright - Use Playwright to enable automation for testing, scripting, and AI agents. Browser access on the host machine is not allowed, initialize Playwright as a testing layer to give access to browser specific tooling in a Docker container.

https://playwright.dev/

Node Test runner - If we ever need to test JavaScript modules, be sure to set up Node TestRunner for this purpose.

https://nodejs.org/api/test.html
